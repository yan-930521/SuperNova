import * as fs from 'fs';
import * as path from 'path';

import { BaseAgent } from '../agent/BaseAgent';
import { MainAgent } from '../agent/MainAgent';
import { WorkerAgent } from '../agent/WorkerAgent';
import { recorder } from './LogManager';

/**
 * Agent 註冊與動態加載中心
 * 負責從配置檔案加載 Agent 並管理其生命週期。
 * 核心依賴 (如 ModelRegistry) 透過 GlobalRuntime 存取。
 */
export class AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();
  private agentsDir: string = './agents';

  /**
   * 註冊一個 Agent 實例
   */
  register(agent: BaseAgent): void {
    recorder.info(`[AgentRegistry] Registering agent: ${agent.id} (role: ${agent.role})`, { type: 'SYSTEM' });
    this.agents.set(agent.id, agent);
  }

  /**
   * 根據 ID 獲取 Agent
   */
  getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * 從檔案加載 Agent
   */
  async loadAgentById(id: string, agentsDir?: string): Promise<BaseAgent> {
    const dir = agentsDir || this.agentsDir;
    const filePath = path.join(dir, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Agent config not found: ${filePath}`);
    }

    const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    config.id = config.id || id;

    return await this.loadAgentFromJSON(config);
  }

  /**
   * 從 JSON 數據動態加載並實例化 Agent
   */
  async loadAgentFromJSON(agentJson: Record<string, any>): Promise<BaseAgent> {
    const { type, id } = agentJson;
    let agent: BaseAgent;

    recorder.info(`[AgentRegistry] Creating agent: ${id} (type: ${type})`, { type: 'SYSTEM' });

    switch (type) {
      case 'MAIN_AGENT':
        agent = new MainAgent(id);
        break;
      case 'WORKER': default:
        agent = new WorkerAgent(id);
        break;
    }

    await agent.initFromJSON(agentJson);
    this.register(agent);
    return agent;
  }

  /**
   * 載入目錄下所有 Agent
   */
  async loadAllAgentsFromDir(dirPath?: string): Promise<void> {
    const targetPath = dirPath || this.agentsDir;
    if (!fs.existsSync(targetPath)) return;

    const files = fs.readdirSync(targetPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const config = JSON.parse(fs.readFileSync(path.join(targetPath, file), 'utf-8'));
          await this.loadAgentFromJSON(config);
        } catch (error) {
          recorder.error(`[AgentRegistry] Failed to load ${file}`, { payload: error });
        }
      }
    }
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }
}
