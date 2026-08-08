import { Config } from '../config/Config';
import { HookEvent, IEvent, IEventBus, PromptSectionIndex } from '../domain/IBus';
import { IAgentStateRepository, IDataBlockRepository } from '../domain/IRepository';
import { ITaskManager } from '../domain/ITask';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { LLMProvider } from '../infra/llm/LLMProvider';
import { LogManager } from '../infra/LogManager';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { BaseTool } from '../tools/BaseTool';
import { ToolRegistry } from '../tools/ToolRegistry';
import { AgentOptions, AgentType, BaseAgent } from './BaseAgent';
import { EmbodiedAgent } from './EmbodiedAgent';
import { MainAgent } from './MainAgent';
import { TaskAgent } from './TaskAgent';

/**
 * 代理人管理器 (AgentManager)
 * 負責所有 Agent 的生命週期、活躍池管理以及與倉儲層的存取 (Dehydrate / Rehydrate)
 */
export class AgentManager implements ILifecycle {
    private readonly logger = LogManager.recorder;

    // 記憶體中的活躍 Agent 池 (Key: agentId)
    private readonly activeAgents: Map<string, BaseAgent> = new Map();
    private readonly toolRegistry: ToolRegistry;
    private readonly sessionAgents: Map<string, Set<string>> = new Map();

    private addAgentToPool(agent: BaseAgent) {
        this.activeAgents.set(agent.id, agent);
        if (!this.sessionAgents.has(agent.sessionId)) {
            this.sessionAgents.set(agent.sessionId, new Set());
        }
        this.sessionAgents.get(agent.sessionId)!.add(agent.id);
    }

    private removeAgentFromPool(agentId: string) {
        const agent = this.activeAgents.get(agentId);
        if (agent) {
            this.activeAgents.delete(agentId);
            const sessionSet = this.sessionAgents.get(agent.sessionId);
            if (sessionSet) {
                sessionSet.delete(agentId);
                if (sessionSet.size === 0) {
                    this.sessionAgents.delete(agent.sessionId);
                }
            }
        }
    }

    constructor(
        private readonly config: Config,
        private readonly stateRepo: IAgentStateRepository,
        private readonly eventBus: IEventBus,
        private readonly dataBlockRepo: IDataBlockRepository,
        private readonly workspaceManager: IWorkspaceManager,
        private readonly llmProvider: LLMProvider,
        private readonly taskManager: ITaskManager
    ) {
        this.toolRegistry = new ToolRegistry(this.workspaceManager, this, this.taskManager, this.llmProvider);
    }

    // ==========================================
    // 生命週期 (ILifecycle)
    // ==========================================

    public async initialize(): Promise<void> {
        this.logger.info('[AgentManager] Initialized.');

        // 註冊全局 Hook，在每個 Agent 思考前注入隊友狀態
        this.eventBus.subscribe(HookEvent.BeforeAgentStep, async (event: IEvent<HookEvent.BeforeAgentStep>) => {
            const payload = event.payload;
            if (!payload || !payload.agentId || !payload.injectedPrompts) return;

            const agentId = payload.agentId;
            const agent = this.activeAgents.get(agentId);
            if (!agent) return;

            const teamMembers = [];
            const peers = this.sessionAgents.get(agent.sessionId);
            if (peers) {
                for (const id of peers) {
                    if (id !== agentId) {
                        const a = this.activeAgents.get(id);
                        if (a) teamMembers.push(`- [${id}] (Type: ${a.type})`);
                    }
                }
            }

            if (teamMembers.length > 0) {
                payload.injectedPrompts.push({
                    index: PromptSectionIndex.ENVIRONMENT_STATE,
                    content: `[NETWORK STATE]\nActive Agents in your session that you can communicate with:\n${teamMembers.join('\n')}`
                });
            }

        });
    }

    public async start(): Promise<void> {
        this.logger.info('[AgentManager] Started.');
    }

    public async stop(): Promise<void> {
        this.logger.info('[AgentManager] Stopping... Dehydrating all active agents.');
        // 優雅停機時，掛起並存檔所有 Agent
        const promises: Promise<void>[] = [];
        for (const agentId of this.activeAgents.keys()) {
            promises.push(this.dehydrate(agentId));
        }
        await Promise.all(promises);
        this.logger.info('[AgentManager] All active agents dehydrated successfully.');
    }

    // ==========================================
    // 核心操作 (Spawn, Dehydrate, Rehydrate)
    // ==========================================

    /**
     * 根據 AgentType 實例化對應的 Agent 類別
     */
    private createAgentInstance(
        type: AgentType,
        id: string,
        sessionId: string,
        options?: Partial<AgentOptions>
    ): BaseAgent {
        const mergedOptions: AgentOptions = {
            ...options,
            llmProvider: this.llmProvider,
            eventBus: this.eventBus,
            config: this.config,
            dataBlockRepo: this.dataBlockRepo
        };
        switch (type) {
            case AgentType.MAIN:
                return new MainAgent(id, sessionId, mergedOptions);
            case AgentType.TASK:
                return new TaskAgent(id, sessionId, mergedOptions);
            case AgentType.EMBODIED:
                return new EmbodiedAgent(id, sessionId, mergedOptions);
            default:
                throw new Error(`[AgentManager] Unsupported AgentType: ${type}`);
        }
    }

    /**
     * 建立並註冊一個全新的 Agent
     */
    public async spawnAgent(
        type: AgentType,
        id: string,
        sessionId: string,
        options?: Partial<AgentOptions>
    ): Promise<BaseAgent> {
        if (this.activeAgents.has(id)) {
            throw new Error(`Agent with ID ${id} is already active.`);
        }

        const toolNamesToLoad = options?.allowedTools ?? this.getDefaultTools(type);
        if (options?.isTemp && !toolNamesToLoad.includes('terminate_self')) {
            toolNamesToLoad.push('terminate_self');
        }

        const agent = this.createAgentInstance(type, id, sessionId, {
            ...options,
            allowedTools: toolNamesToLoad
        });

        try {
            // 掛載工作區與工具
            const workspaceType = options?.workspaceType || 'PERSISTENT';
            await this.workspaceManager.initWorkspace(sessionId, id, workspaceType);

            const tools: BaseTool[] = [];
            tools.push(...this.toolRegistry.getTools(toolNamesToLoad));

            agent.updateTools(tools);

            // 初始化完成，切換為就緒狀態並正式加入活躍池
            agent.setReady();
            this.addAgentToPool(agent);

            // 初始存檔 (需確保已經在 activeAgents 內)
            await this.saveAgent(id);

            this.logger.info(`[AgentManager] Spawned new agent ${id} of type ${type}`);
            return agent;
        } catch (err) {
            await agent.destroy();
            this.removeAgentFromPool(id);
            throw err;
        }
    }

    /**
     * 脫水 (掛起並寫入持久化)
     */
    public async dehydrate(agentId: string): Promise<void> {
        const agent = this.activeAgents.get(agentId);
        if (!agent) {
            this.logger.warn(`[AgentManager] Cannot dehydrate agent ${agentId}, not found in active pool.`);
            return;
        }

        // 呼叫實體方法進入掛起狀態，但不直接做檔案 I/O
        agent.suspend();

        // 寫入持久化
        try {
            await this.saveAgent(agentId);
        } finally {
            // 實體銷毀並從池中移除
            await agent.destroy();
            this.removeAgentFromPool(agentId);
        }
        this.logger.debug(`[AgentManager] Agent ${agentId} dehydrated.`);
    }

    /**
     * 儲存特定 Agent 的狀態快照，但不掛起/銷毀它
     * 適用於對話進行中、工具執行完畢後的即時存檔
     */
    public async saveAgent(agentId: string): Promise<void> {
        const agent = this.activeAgents.get(agentId);
        if (!agent) {
            this.logger.warn(`[AgentManager] Cannot save agent ${agentId}, not found in active pool.`);
            return;
        }

        const data = agent.serialize();
        await this.stateRepo.saveAgentState(agent.sessionId, agentId, data);
        this.logger.debug(`[AgentManager] Agent ${agentId} state saved.`);
    }

    /**
     * 徹底銷毀 (用於 GC，例如分身執行完畢後消散)
     * 不寫入狀態快照，直接從記憶體抹除實體
     */
    public async terminateAgent(agentId: string): Promise<void> {
        const agent = this.activeAgents.get(agentId);
        if (!agent) {
            this.logger.warn(`[AgentManager] Cannot terminate agent ${agentId}, not found in active pool.`);
            return;
        }

        // 呼叫實體的 destroy 清理內部訂閱與定時器
        await agent.destroy();

        // 從活躍池中移除
        this.removeAgentFromPool(agentId);
        this.logger.info(`[AgentManager] Agent ${agentId} terminated (GC).`);
    }

    public getAgent(agentId: string): BaseAgent | undefined {
        return this.activeAgents.get(agentId);
    }

    /**
     * 喚醒 (從持久化讀取並還原到記憶體)
     */
    public async rehydrate(agentId: string, sessionId: string, options?: any): Promise<BaseAgent> {
        if (this.activeAgents.has(agentId)) {
            this.logger.warn(`[AgentManager] Agent ${agentId} is already active.`);
            return this.activeAgents.get(agentId)!;
        }

        // 從儲存庫讀取
        const data = await this.stateRepo.loadAgentState(sessionId, agentId);

        if (!data) {
            throw new Error(`[AgentManager] Failed to rehydrate agent ${agentId}: State data not found.`);
        }

        // 透過靜態載入建立實例
        const agent = this.createAgentInstance(data.type, data.id, data.sessionId, options);

        // 注入狀態
        agent.hydrate(data);

        // 掛載工作區與工具
        await this.workspaceManager.initWorkspace(sessionId, agentId, data.workspaceType || 'PERSISTENT');

        const tools: BaseTool[] = [];
        const toolNamesToLoad = (data as any).allowedTools ?? this.getDefaultTools(data.type);
        if (data.isTemp && !toolNamesToLoad.includes('terminate_self')) {
            toolNamesToLoad.push('terminate_self');
        }
        tools.push(...this.toolRegistry.getTools(toolNamesToLoad));

        agent.updateTools(tools);
        agent.setReady();

        // 完全就緒後才放入活躍池
        this.addAgentToPool(agent);

        this.logger.debug(`[AgentManager] Agent ${agentId} rehydrated successfully.`);
        return agent;
    }

    public async dehydrateSession(sessionId: string): Promise<void> {
        const agentIds = this.sessionAgents.get(sessionId);
        if (!agentIds || agentIds.size === 0) return;

        // 拷貝一份避免迭代中修改 Set
        const promises = Array.from(agentIds).map(id => this.dehydrate(id));
        await Promise.all(promises);
        this.logger.info(`[AgentManager] All agents in session ${sessionId} have been dehydrated.`);
    }

    public getDefaultTools(type: AgentType): string[] {
        if (type === AgentType.MAIN) {
            return ['toggle_projection', 'read_file', 'write_file', 'list_files', 'run_bash', 'read_blob', 'send_message', 'spawn_agent', 'plan_tasks', 'check_task_dashboard'];
        }
        if (type === AgentType.TASK) {
            return ['read_file', 'write_file', 'list_files', 'run_bash', 'read_blob', 'send_message'];
        }
        return ['send_message'];
    }
}
