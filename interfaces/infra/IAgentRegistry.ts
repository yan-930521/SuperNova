import type { IAgent } from '../agent/IAgent';

/**
 * Agent 註冊與動態加載中心
 * 負責管理系統中所有可用的 Agent 實例及其生命週期。
 */
export interface IAgentRegistry {
  /** 
   * 手動註冊一個 Agent 實例 
   * @param agent 實現了 IAgent 接口的實例
   */
  register(agent: IAgent): void;

  /** 
   * 根據 ID 獲取已註冊的 Agent 實例 
   * @param id Agent 的唯一識別碼
   */
  getAgent(id: string): IAgent | undefined;

  /**
   * 獲取所有已註冊的 Agent 實例
   */
  getAllAgents(): IAgent[];
  
  /** 
   * 根據角色名稱獲取 Agent 實例列表 
   * @param role Agent 的角色名稱
   */
  getAgentByRole(role: string): IAgent[];

  /** 
   * 從 JSON 數據動態加載並實例化 Agent
   * 通常用於從配置或持久化存儲中恢復 Agent。
   * @param agentJson Agent 的序列化數據
   */
  loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent>;

  /**
   * 從指定目錄加載所有 Agent 配置
   * @param dirPath 目錄路徑 (選擇性，若不傳入則使用預設配置)
   */
  loadAllAgentsFromDir(dirPath?: string): Promise<void>;

  /**
   * 確保存在預設的 Worker Agent
   */
  ensureDefaultWorker(): Promise<IAgent>;

  /**
   * 更新註冊表的運行時配置
   * @param agentsDir Agent 配置目錄
   * @param defaultId 預設 Agent ID
   */
  updateConfig(agentsDir: string, defaultId: string): void;
}
