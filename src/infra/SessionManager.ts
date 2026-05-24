import { Session } from '../session/Session';
import { recorder } from './LogManager';

/**
 * 會話生命週期管理器 (SessionManager)
 * 管理輕量級「會話層總帳」的生命週期。
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  /**
   * 創建一個新的會話
   * @param goal 會話目標
   * @param responsibleAgentId 負責此會話的主代理 ID
   * @param id 會話 ID (選擇性)
   */
  createSession(goal: string, responsibleAgentId: string, id?: string): Session {
    const sessionId = id || `session-${Date.now()}`;
    recorder.info(`[SessionManager] Creating new session: ${sessionId} for agent ${responsibleAgentId}`, { type: 'LIFECYCLE' });
    
    const session = new Session(sessionId, goal, responsibleAgentId);
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * 從 JSON 數據恢復會話
   * @param data 序列化數據
   */
  async restoreFromJSON(data: Record<string, any>): Promise<Session> {
    const id = data.id;
    const goal = data.goal || 'No goal specified';
    const responsibleAgentId = data.responsibleAgentId || 'unknown';
    
    if (!id) throw new Error('Session ID is required for restoration.');

    recorder.info(`[SessionManager] Restoring session from JSON: ${id}`, { type: 'LIFECYCLE' });
    const session = new Session(id, goal, responsibleAgentId);
    await session.initFromJSON(data);
    
    this.sessions.set(id, session);
    return session;
  }

  /**
   * 獲取指定 ID 的會話
   * @param id 會話 ID
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * 刪除會話
   * @param id 會話 ID
   */
  deleteSession(id: string): void {
    recorder.info(`[SessionManager] Deleting session: ${id}`, { type: 'LIFECYCLE' });
    this.sessions.delete(id);
  }

  /**
   * 獲取所有活動中的會話
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
}
