import { BaseAgent } from '../agent/BaseAgent';
import { MainAgent } from '../agent/MainAgent';
import { WorkerAgent } from '../agent/WorkerAgent';
import { recorder } from './LogManager';
import { IAgentRepository } from './types/agent';

/**
 * 代理生命週期管理器 (AgentManager)
 * 負責從 IAgentRepository 加載代理配置，並將其動態實例化為活躍的代理對象。
 */
export class AgentManager {
  /** 內存緩存：儲存當前已實例化的代理對象 */
  private agents: Map<string, BaseAgent> = new Map();

  /**
   * @param repo 注入代理儲存庫，負責底層配置 IO
   */
  constructor(private repo: IAgentRepository) {}

  /**
   * 手動註冊一個已存在的 Agent 實例
   */
  register(agent: BaseAgent): void {
    recorder.info(`[AgentManager] Registering agent instance: ${agent.id} (role: ${agent.role})`, { type: 'SYSTEM' });
    this.agents.set(agent.id, agent);
  }

  /**
   * 根據 ID 獲取活躍的 Agent 實例
   */
  getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * 從儲存庫加載並實例化單個 Agent
   */
  async loadAgentById(id: string): Promise<BaseAgent> {
    const dto = await this.repo.findById(id);
    if (!dto) {
      throw new Error(`Agent config not found for ID: ${id}`);
    }

    return await this.instantiateAgent(dto);
  }

  /**
   * 從 DTO 數據動態實例化 Agent
   * 根據配置中的 type (或角色) 決定使用的類別。
   */
  private async instantiateAgent(dto: any): Promise<BaseAgent> {
    const { type, id } = dto;
    let agent: BaseAgent;

    recorder.info(`[AgentManager] Instantiating agent: ${id}`, { type: 'SYSTEM' });

    // 根據 DTO 內容決定具體子類
    // 註：未來可擴展為基於 AgentComponentFactory 的動態裝配
    switch (type) {
      case 'MAIN_AGENT':
        agent = new MainAgent(id);
        break;
      default:
        agent = new WorkerAgent(id);
        break;
    }

    // 將 DTO 屬性注入實體 (舊版 initFromJSON 的 DTO 版本)
    await agent.initFromJSON(dto);
    this.register(agent);
    return agent;
  }

  /**
   * 載入儲存庫中所有可用的 Agent
   */
  async loadAllAgents(): Promise<void> {
    recorder.info('[AgentManager] Loading all agents from repository...', { type: 'SYSTEM' });
    const dtos = await this.repo.findAll();
    
    for (const dto of dtos) {
      try {
        await this.instantiateAgent(dto);
      } catch (error) {
        recorder.error(`[AgentManager] Failed to instantiate agent ${dto.id}`, { payload: error });
      }
    }
  }

  /**
   * 獲取所有當前活動的 Agent 實體
   */
  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }
}
