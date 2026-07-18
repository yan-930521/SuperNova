import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { IAgentStateRepository } from '../infra/persistence/IRepository';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { IEventBus } from '../messaging/IBus';
import { AgentType, BaseAgent } from './BaseAgent';
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
    private readonly eventBus: IEventBus
  ) {}

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
    options?: any
  ): BaseAgent {
    switch (type) {
      case AgentType.MAIN:
        return new MainAgent(id, sessionId, this.eventBus, this.config, options);
      case AgentType.SUB:
        return new SubAgent(id, sessionId, this.eventBus, this.config, options);
      case AgentType.EMBODIED:
        return new EmbodiedAgent(id, sessionId, this.eventBus, this.config, options);
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
    options?: any
  ): Promise<BaseAgent> {
    if (this.activeAgents.has(id)) {
      throw new Error(`Agent with ID ${id} is already active.`);
    }

    // 透過靜態載入建立實例
    const agent = this.createAgentInstance(type, id, sessionId, options);
    
    // 放入活躍池
    this.activeAgents.set(id, agent);
    
    // 初始存檔
    const data = agent.serialize();
    await this.stateRepo.saveAgentState(sessionId, id, data, {
      isClone: data.isClone,
      parentAgentId: data.parentAgentId
    });

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
