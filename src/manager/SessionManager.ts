import { recorder } from '../infra/LogManager';
import { ISessionRepository, MessageDTO } from '../infra/types/session';
import { Session } from '../models/Session';

/**
 * 會話生命週期管理器 (SessionManager)
 * 負責管理活躍中 (In-memory) 的會話實體，並協調 Repository 進行持久化。
 */
export class SessionManager {
  /** 內存緩存：儲存當前活動中的會話對象 */
  private sessions: Map<string, Session> = new Map();

  /**
   * @param repo 注入會話儲存庫，負責底層 IO
   */
  constructor(private repo: ISessionRepository) {}

  /**
   * 創建一個新的會話
   * @param goal 會話目標
   * @param responsibleAgentId 負責此會話的主代理 ID
   * @param userId 所屬用戶 ID (預設為 default-user)
   * @param id 指定會話 ID (選擇性)
   */
  async createSession(responsibleAgentId: string, userId: string = 'default-user', id?: string): Promise<Session> {
    const sessionId = id || `session-${Date.now()}`;
    recorder.info(`[SessionManager] Creating new session: ${sessionId}`, { type: 'LIFECYCLE' });
    
    const session = new Session(sessionId, responsibleAgentId, userId);
    
    // 1. 存入內存緩存
    this.sessions.set(sessionId, session);
    
    // 2. 初始持久化
    await this.repo.save(session.toDTO());
    
    return session;
  }

  /**
   * 獲取指定 ID 的會話實體
   * 採「緩存優先」策略，緩存失效則嘗試從 Repository 加載。
   */
  async getSession(id: string): Promise<Session | undefined> {
    // 1. 檢查內存
    if (this.sessions.has(id)) {
      return this.sessions.get(id);
    }

    // 2. 嘗試從 Repository 加載 (持久層)
    recorder.debug(`[SessionManager] Cache miss for session ${id}, attempting load from repo...`);
    const dto = await this.repo.findById(id);
    if (dto) {
      const session = new Session(dto.id, dto.responsibleAgentId, dto.userId);
      await session.initFromDTO(dto);
      this.sessions.set(id, session); // 補回緩存
      return session;
    }

    return undefined;
  }

  /**
   * 保存指定會話的當前狀態到持久層
   */
  async saveSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      await this.repo.save(session.toDTO());
      recorder.debug(`[SessionManager] Session ${id} persisted to storage.`);
    }
  }

  /**
   * 僅附加一條訊息到會話歷史 (效能優化)
   */
  async appendMessage(id: string, message: MessageDTO): Promise<void> {
    await this.repo.appendMessage(id, message);
    recorder.debug(`[SessionManager] Message appended to session ${id}.`);
  }

  /**
   * 刪除會話
   */
  async deleteSession(id: string): Promise<void> {
    recorder.info(`[SessionManager] Deleting session: ${id}`, { type: 'LIFECYCLE' });
    this.sessions.delete(id);
  }

  /**
   * 獲取當前內存中所有活動的會話
   */
  getAllActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
}
