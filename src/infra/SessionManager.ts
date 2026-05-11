import { ISessionManager } from '../../interfaces/infra/ISessionManager';
import { ISession } from '../../interfaces/session/ISession';
import { BaseSession } from '../session/BaseSession';

/**
 * SessionManager 實作
 * 負責管理 Session 的生命週期，包括創建、恢復與銷毀。
 */
export class SessionManager implements ISessionManager {
  private sessions: Map<string, ISession> = new Map();

  /**
   * 從 JSON 數據創建一個新的會話實例
   * @param json 會話的序列化數據
   */
  async createFromJSON(json: Record<string, any>): Promise<ISession> {
    const id = json.id || `session-${Date.now()}`;
    const goal = json.goal || 'No goal specified';
    
    console.log(`[SessionManager] Creating session from JSON: ${id}`);
    const session = new BaseSession(id, goal);
    await session.loadFromJSON(json);
    
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * 從快照恢復會話
   * @param snapshot 序列化後的會話快照（目前預期為 JSON 字符串）
   */
  async restoreFromSnapshot(snapshot: string): Promise<ISession> {
    console.log(`[SessionManager] Restoring session from snapshot`);
    try {
      const json = JSON.parse(snapshot);
      return this.createFromJSON(json);
    } catch (error) {
      console.error(`[SessionManager] Failed to restore session: ${error}`);
      throw new Error(`Failed to restore session from snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 獲取指定 ID 的會話
   * @param id 會話 ID
   */
  getSession(id: string): ISession | undefined {
    return this.sessions.get(id);
  }

  /**
   * 刪除指定 ID 的會話
   * @param id 會話 ID
   */
  deleteSession(id: string): void {
    console.log(`[SessionManager] Deleting session: ${id}`);
    this.sessions.delete(id);
  }
}
