import { IAgent } from './agent';
import { ISession } from './session';

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
   * 從 JSON 數據動態加載並實例化 Agent
   * 通常用於從配置或持久化存儲中恢復 Agent。
   * @param agentJson Agent 的序列化數據
   */
  loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent>;
}

/**
 * 會話生命週期管理器
 * 負責會話的創建、持久化恢復以及快照管理。
 */
export interface ISessionManager {
  /** 
   * 從 JSON 數據創建一個新的會話實例 
   * @param json 會話的序列化配置或狀態數據
   */
  createFromJSON(json: Record<string, any>): Promise<ISession>;

  /** 
   * 從指定的快照字符串中恢復會話狀態
   * @param snapshot 序列化後的會話快照
   */
  restoreFromSnapshot(snapshot: string): Promise<ISession>;
}
