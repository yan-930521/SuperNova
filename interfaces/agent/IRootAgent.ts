import type { IAgent } from './IAgent';

/**
 * 根級 Agent 接口 (Root Agent)
 * 繼承自 IAgent，作為系統入口負責會話的生命週期管理。
 */
export interface IRootAgent extends IAgent {
  /** 
   * 創建一個新的協作會話
   * @param goal 初始目標
   * @param config 可選的初始化配置
   */
  createSession(goal: string, config?: any): Promise<string>;

  /** 
   * 終止指定的會話並清理資源
   * @param session_id 會話 UUID
   */
  terminateSession(session_id: string): Promise<void>;
}
