import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { IAgentRepository, ITaskRepository } from '../../infra/persistence/IRepository';
import { AgentDTO, AgentType } from '../../infra/types/agent';
import { BaseAgent, IAgentDependencies } from '../../agent/BaseAgent';
import { MainAgent } from '../../agent/MainAgent';
import { WorkerAgent } from '../../agent/WorkerAgent';
import { recorder } from '../../infra/LogManager';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { Task } from '../../domain/task/Task';

/**
 * AgentService (代理服務)
 * 負責管理系統中所有活躍的 Agent 實例，協調從 Repository 載入配置與動態實例化。
 * 取代舊有的 AgentManager。
 */
export class AgentService implements ILifecycle {
  /** 內存緩存：儲存當前已實例化的代理對象 (agentId -> BaseAgent) */
  private agents = new Map<string, BaseAgent>();

  constructor(
    private readonly agentRepo: IAgentRepository<AgentDTO>,
    private readonly runtime: GlobalRuntime
  ) {}

  /**
   * 生命週期：初始化
   */
  async initialize(): Promise<void> {
    recorder.info('[AgentService] Initialized', { type: 'SYSTEM' });
  }

  /**
   * 生命週期：啟動，自動載入所有代理配置
   */
  async start(): Promise<void> {
    recorder.info('[AgentService] Loading all agents from repository...', { type: 'SYSTEM' });
    await this.loadAllAgents();
  }

  /**
   * 生命週期：停止，清理實體
   */
  async stop(): Promise<void> {
    this.agents.clear();
    recorder.info('[AgentService] Stopped and cleared active agents', { type: 'SYSTEM' });
  }

  /**
   * 根據 ID 獲取活躍的 Agent 實例
   */
  public getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * 獲取所有當前活動的 Agent 實體
   */
  public getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 手動註冊一個 Agent 實例
   */
  public register(agent: BaseAgent): void {
    recorder.info(`[AgentService] Registering agent instance: ${agent.id}`, { type: 'SYSTEM' });
    
    // 注入依賴
    agent.setDependencies(this.getAgentDependencies());
    this.agents.set(agent.id, agent);
  }

  /**
   * 準備 Agent 運行所需的依賴項
   */
  private getAgentDependencies(): IAgentDependencies {
    const container = this.runtime.container;
    return {
      toolRegistry: container.resolve('ToolRegistry'),
      modelRegistry: container.resolve('ModelRegistry'),
      memoryService: container.resolve('MemoryService'),
      orchestratedContextService: container.resolve('OrchestratedContextService'),
      taskRepo: container.resolve('TaskRepo') as ITaskRepository<Task>,
      eventBus: container.resolve('EventBus')
    };
  }

  /**
   * 從儲存庫加載所有可用的 Agent
   */
  private async loadAllAgents(): Promise<void> {
    try {
      const dtos = await this.agentRepo.findAll();
      for (const dto of dtos) {
        try {
          await this.instantiateAgent(dto);
        } catch (error) {
          recorder.error(`[AgentService] Failed to instantiate agent ${dto.id}`, {
            type: 'SYSTEM',
            payload: { error: error instanceof Error ? error.message : String(error) }
          });
        }
      }
    } catch (error) {
      recorder.error('[AgentService] Critical error loading agents from repository', {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  /**
   * 動態實例化 Agent
   */
  private async instantiateAgent(dto: AgentDTO): Promise<BaseAgent> {
    const { id, type } = dto;
    let agent: BaseAgent;

    recorder.debug(`[AgentService] Instantiating agent: ${id} (Type: ${type})`, { type: 'SYSTEM' });

    // 1. 建立實例 (增加對字串值的容錯處理)
    const agentType = String(type).toUpperCase();

    if (agentType === AgentType.MAIN_AGENT) {
      agent = new MainAgent(id);
    } else {
      // 預設皆為 WorkerAgent
      agent = new WorkerAgent(id);
    }

    // 2. 從 JSON 初始化配置 (Prompts 等)
    await agent.initFromJSON(dto);

    // 3. 注入依賴服務
    agent.setDependencies(this.getAgentDependencies());

    // 4. 註冊工具
    agent.registerDefaultTools();

    this.agents.set(id, agent);
    return agent;
  }

  /**
   * 按需求手動重新載入特定 Agent
   */
  public async reloadAgent(id: string): Promise<BaseAgent> {
    const dto = await this.agentRepo.load(id);
    if (!dto) throw new Error(`[AgentService] Agent ${id} not found in repository.`);
    
    return await this.instantiateAgent(dto);
  }
}
