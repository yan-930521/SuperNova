import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { IWorkspaceManager } from '../infra/persistence';
import { IAgentStateRepository, IDataBlockRepository } from '../infra/persistence/IRepository';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { IEventBus } from '../messaging/IBus';
import { AgentOptions, AgentType, BaseAgent } from './BaseAgent';
import { EmbodiedAgent } from './EmbodiedAgent';
import { MainAgent } from './MainAgent';
import { SubAgent } from './SubAgent';

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
        switch (type) {
            case AgentType.MAIN:
                return new MainAgent(id, sessionId, this.eventBus, this.config, this.dataBlockRepo, options);
            case AgentType.SUB:
                return new SubAgent(id, sessionId, this.eventBus, this.config, this.dataBlockRepo, options);
            case AgentType.EMBODIED:
                return new EmbodiedAgent(id, sessionId, this.eventBus, this.config, this.dataBlockRepo, options);
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
            await this.workspaceManager.initWorkspace(sessionId, id);
            agent.updateTools(this.workspaceManager.loadTools(sessionId, id));

            // 初始化完成，切換為就緒狀態
            agent.setReady();

            // 初始存檔
            const data = agent.serialize();
            await this.stateRepo.saveAgentState(sessionId, id, data, {
                isClone: data.isClone,
                parentAgentId: data.parentAgentId
            });
        } catch (err) {
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

        // 序列化並存檔
        const data = agent.serialize();
        await this.stateRepo.saveAgentState(agent.sessionId, agentId, data, {
            isClone: data.isClone,
            parentAgentId: data.parentAgentId
        });

        // 實體銷毀並從池中移除
        await agent.destroy();
        this.activeAgents.delete(agentId);
        this.logger.debug(`[AgentManager] Agent ${agentId} dehydrated.`);
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
        await this.workspaceManager.initWorkspace(sessionId, agentId);
        agent.updateTools(this.workspaceManager.loadTools(sessionId, agentId));

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
