import type { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';
import type { IAgent } from '../../interfaces/agent/IAgent';
import type { IModelRegistry } from '../../interfaces/runtime/IModelRegistry';
import type { ITaskPlanEngine } from '../../interfaces/agent/ITaskPlanEngine';
import { BaseAgent } from '../agent/BaseAgent';
import { CoordinatorAgent } from '../agent/CoordinatorAgent';
import { EvaluatorAgent } from '../agent/EvaluatorAgent';
import { TaskPlanEngine } from '../agent/TaskPlanEngine';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AgentRegistry 類
 * 實作 IAgentRegistry 接口，負責管理系統中所有可用的 Agent 實例。
 */
export class AgentRegistry implements IAgentRegistry {
  private agents: Map<string, IAgent> = new Map();
  private taskPlanEngine?: ITaskPlanEngine;

  constructor(private modelRegistry?: IModelRegistry) {
    if (this.modelRegistry) {
      this.taskPlanEngine = new TaskPlanEngine(this.modelRegistry);
    }
  }

  /**
   * 手動註冊一個 Agent 實例
   */
  register(agent: IAgent): void {
    console.log(`[AgentRegistry] Registering agent: ${agent.id} (role: ${agent.role})`);
    this.agents.set(agent.id, agent);
  }

  /**
   * 根據 ID 獲取已註冊的 Agent 實例
   */
  getAgent(id: string): IAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * 根據 ID 從檔案加載並實例化 Agent
   * @param id Agent ID
   */
  async loadAgentById(id: string): Promise<IAgent> {
    const filePath = path.resolve(process.cwd(), `agents/${id}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Agent config not found for ID: ${id} at ${filePath}`);
    }

    const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // 強制將檔案中的 ID 與請求的 ID 對齊，若檔案中未定義則補上
    config.id = config.id || id;
    
    return await this.loadAgentFromJSON(config);
  }

  /**
   * 從 JSON 數據動態加載並實例化 Agent
   * @param agentJson Agent 的序列化數據
   */
  async loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent> {
    const { type } = agentJson;
    let agent: IAgent;

    // 根據 type 映射具體的實作類
    switch (type) {
      case 'COORDINATOR':
        agent = new CoordinatorAgent(this.taskPlanEngine);
        break;
      case 'EVALUATOR':
        if (!this.modelRegistry) {
          throw new Error('ModelRegistry is required to instantiate EVALUATOR agent.');
        }
        agent = new EvaluatorAgent(this.modelRegistry);
        break;
      case 'BASE':
        agent = new BaseAgent();
        break;
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }

    await agent.initFromJSON(agentJson);
    this.register(agent);
    return agent;
  }
}
