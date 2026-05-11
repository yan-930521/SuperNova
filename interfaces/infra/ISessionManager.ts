import { ISession } from '../session/ISession';

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
