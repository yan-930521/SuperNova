import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { IWorkspaceManager } from '../infra/persistence';
import { IAgentStateRepository, IDataBlockRepository } from '../infra/persistence/IRepository';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { HookEvent, IEvent, IEventBus } from '../messaging/IBus';
import { BaseTool } from './';
import { AgentOptions, AgentType, BaseAgent } from './BaseAgent';
import { EmbodiedAgent } from './EmbodiedAgent';
import { MainAgent } from './MainAgent';
import { TaskAgent } from './TaskAgent';
import { SendMessageTool, ToggleProjectionTool } from './tool/AgentTools';

/**
 * 代理人管理器 (AgentManager)
 * 負責所有 Agent 的生命週期、活躍池管理以及與倉儲層的存取 (Dehydrate / Rehydrate)
 */
export class AgentManager implements ILifecycle {
    private readonly logger = LogManager.recorder;

    // 記憶體中的活躍 Agent 池 (Key: agentId)
    private readonly activeAgents: Map<string, BaseAgent> = new Map();

    constructor(
        private readonly config: Config,
        private readonly stateRepo: IAgentStateRepository,
        private readonly eventBus: IEventBus,
        private readonly dataBlockRepo: IDataBlockRepository,
        private readonly workspaceManager: IWorkspaceManager,
    ) { }

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
            for (const [id, a] of this.activeAgents.entries()) {
                if (a.sessionId === agent.sessionId && id !== agentId) {
                    teamMembers.push(`- [${id}] (Type: ${a.type})`);
                }
            }

            if (teamMembers.length > 0) {
                payload.injectedPrompts.push({
                    index: 4.5, // 介於 ENVIRONMENT_STATE(4) 與 EMOTIONAL_STATE(5) 之間
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
        options?: AgentOptions
    ): BaseAgent {
        const mergedOptions = { ...options, agentManager: this };
        switch (type) {
            case AgentType.MAIN:
                return new MainAgent(id, sessionId, this.eventBus, this.config, this.dataBlockRepo, mergedOptions);
            case AgentType.TASK:
                return new TaskAgent(id, sessionId, this.eventBus, this.config, this.dataBlockRepo, mergedOptions);
            case AgentType.EMBODIED:
                return new EmbodiedAgent(id, sessionId, this.eventBus, this.config, this.dataBlockRepo, mergedOptions);
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
        options?: AgentOptions
    ): Promise<BaseAgent> {
        if (this.activeAgents.has(id)) {
            throw new Error(`Agent with ID ${id} is already active.`);
        }

        // 透過靜態載入建立實例
        const agent = this.createAgentInstance(type, id, sessionId, options);

        // 放入活躍池
        this.activeAgents.set(id, agent);

        try {
            // 掛載工作區與工具
            const parentAgentId = options?.parentAgent?.id;
            const workspaceType = options?.workspaceType || 'PERSISTENT';
            await this.workspaceManager.initWorkspace(sessionId, id, workspaceType as any, { parentAgentId });

            const tools: BaseTool[] = [];

            if (type === AgentType.MAIN) {
                tools.push(new ToggleProjectionTool());
            }

            if (type === AgentType.MAIN || type === AgentType.TASK) {
                tools.push(...this.workspaceManager.loadTools(sessionId, id));
            }
            tools.push(new SendMessageTool());

            agent.updateTools(tools);

            // 初始化完成，切換為就緒狀態
            agent.setReady();

            // 初始存檔
            await this.saveAgent(id);
        } catch (err) {
            await agent.destroy();
            this.activeAgents.delete(id);
            throw err;
        }

        this.logger.info(`[AgentManager] Spawned new agent ${id} of type ${type}`);
        return agent;
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
            this.activeAgents.delete(agentId);
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
        await this.stateRepo.saveAgentState(agent.sessionId, agentId, data, {
            isClone: data.isClone,
            parentAgentId: data.parentAgentId
        });
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
        this.activeAgents.delete(agentId);
        this.logger.info(`[AgentManager] Agent ${agentId} terminated (GC).`);
    }

    /**
     * 計算特定 Agent 當前在記憶體中活躍的分身數量
     */
    public getActiveCloneCount(parentAgentId: string): number {
        let count = 0;
        for (const agent of this.activeAgents.values()) {
            const data = agent.serialize();
            if (data.isClone && data.parentAgentId === parentAgentId) {
                count++;
            }
        }
        return count;
    }

    public getAgent(agentId: string): BaseAgent | undefined {
        return this.activeAgents.get(agentId);
    }

    public getProjectedBodyId(agentId: string, sessionId: string): string | null {
        const agent = this.activeAgents.get(agentId);
        if (agent && agent.sessionId === sessionId) {
            return agent.projectedBodyId;
        }
        return null;
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
        const isClone = options?.isClone;
        const parentAgentId = options?.parentAgentId;
        const data = await this.stateRepo.loadAgentState(sessionId, agentId, { isClone, parentAgentId });

        if (!data) {
            throw new Error(`[AgentManager] Failed to rehydrate agent ${agentId}: State data not found.`);
        }

        // 透過靜態載入建立實例
        const agent = this.createAgentInstance(data.type, data.id, data.sessionId, options);

        // 注入狀態
        agent.hydrate(data);

        // 掛載工作區與工具
        await this.workspaceManager.initWorkspace(sessionId, agentId, data.workspaceType || 'PERSISTENT', { parentAgentId: data.parentAgentId });

        const tools: any[] = [];
        if (data.type === AgentType.MAIN) {
            tools.push(new ToggleProjectionTool());
        }
        if (data.type === AgentType.MAIN || data.type === AgentType.TASK) {
            tools.push(...this.workspaceManager.loadTools(sessionId, agentId));
        }
        tools.push(new SendMessageTool());

        agent.updateTools(tools);

        // 加回活躍池
        this.activeAgents.set(agentId, agent);

        this.logger.debug(`[AgentManager] Agent ${agentId} rehydrated successfully.`);
        return agent;
    }

    /**
     * 一次性將特定 Session 內的所有活躍 Agent 脫水掛起
     */
    public async dehydrateSession(sessionId: string): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const [agentId, agent] of this.activeAgents.entries()) {
            if (agent.sessionId === sessionId) {
                promises.push(this.dehydrate(agentId));
            }
        }
        await Promise.all(promises);
        this.logger.info(`[AgentManager] All agents in session ${sessionId} have been dehydrated.`);
    }
}
