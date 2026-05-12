import { ISession } from '../session/ISession';

/**
 * 快照管理器接口
 * 負責會話狀態的持久化與恢復。
 */
export interface ISnapshotManager {
  /**
   * 為指定會話建立快照
   * @param session 目標會話
   * @param metadata 額外的元數據（如最後完成的任務 ID）
   * @returns 快照 ID
   */
  snapshot(session: ISession, metadata: Record<string, any>): Promise<string>;

  /**
   * 將會話回滾到指定的檢查點
   * @param session 目標會話
   * @param checkpointId 快照或檢查點 ID
   */
  rollback(session: ISession, checkpointId: string): Promise<void>;

  /**
   * 獲取會話的最新快照 ID
   * @param sessionId 會話 ID
   */
  getLatestSnapshotId(sessionId: string): Promise<string | null>;
}
