import { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';
import { IAgent } from '../../interfaces/agent/IAgent';

/**
 * AgentRegistry 類
 * 實作 IAgentRegistry 接口，負責管理系統中所有可用的 Agent 實例。
 */
export class AgentRegistry implements IAgentRegistry {
  private agents: Map<string, IAgent> = new Map();

  /**
   * 手動註冊一個 Agent 實例
   * @param agent 實現了 IAgent 接口的實例
   */
  register(agent: IAgent): void {
    console.log(`[AgentRegistry] Registering agent: ${agent.id} (role: ${agent.role})`);
    this.agents.set(agent.id, agent);
  }

  /**
   * 根據 ID 獲取已註冊的 Agent 實例
   * @param id Agent 的唯一識別碼
   */
  getAgent(id: string): IAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * 從 JSON 數據動態加載並實例化 Agent
   * @param agentJson Agent 的序列化數據
   */
  async loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent> {
    const { type } = agentJson;
    let agent: IAgent;

    if (type === 'BASE') {
      const { BaseAgent } = await import('../agent/BaseAgent');
      agent = new BaseAgent();
    } else if (type === 'COORDINATOR') {
      const { CoordinatorAgent } = await import('../agent/CoordinatorAgent');
      agent = new CoordinatorAgent();
    } else {
      throw new Error(`Unknown agent type: ${type}`);
    }

    await agent.initFromJSON(agentJson);
    this.register(agent);
    return agent;
  }
}
