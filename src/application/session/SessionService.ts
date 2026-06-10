
import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { IEvent, IEventBus } from '../../core/messaging/IBus';
import { UserSession } from '../../domain/session/UserSession';
import { recorder } from '../../infra/LogManager';
import { IEntity, ISessionRepository } from '../../infra/persistence/IRepository';
import { MessageDTO, MessageRole } from '../../infra/types/session';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';

/**
 * SessionService (會話服務)
 * 負責協調人機對話生命週期、管理 UserSession 實體與持久化。
 */
export class SessionService implements ILifecycle {
  /** 記憶體中的活躍會話緩存 */
  private activeSessions = new Map<string, UserSession>();

  constructor(
    private readonly sessionRepo: ISessionRepository<any, any>
  ) { }

  /**
   * 生命週期：初始化，註冊指令處理器與事件訂閱
   */
  async initialize(): Promise<void> {
    // // 註冊指令處理器

    recorder.info('[SessionService] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[SessionService] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    for (const session of this.activeSessions.values()) {
      await this.sessionRepo.save(session.toDTO());
    }
    recorder.info('[SessionService] Stopped and persisted active sessions', { type: 'SYSTEM' });
  }

  /**
   * 取得或建立會話實體
   * 優先從記憶體緩存讀取，若無則從持久層加載或新建
   */
  public async getOrCreateSession(id: string, userId: string = 'default-user'): Promise<UserSession> {
    // 1. 檢查緩存
    if (this.activeSessions.has(id)) {
      return this.activeSessions.get(id)!;
    }

    // 2. 嘗試從持久層加載
    const dto = await this.sessionRepo.load(id);
    if (dto) {
      const session = new UserSession(dto.id, dto.userId, dto.responsibleAgentId, dto.status);
      session.setHistory(dto.history || []);
      session.metadata = dto.metadata || {};
      this.activeSessions.set(id, session);
      return session;
    }

    // 3. 建立新會話
    const newSession = new UserSession(id, userId, 'Supervisor-01', 'IDLE');
    this.activeSessions.set(id, newSession);
    await this.sessionRepo.save(newSession.toDTO());
    return newSession;
  }

  /**
   * 儲存會話狀態
   */
  public async saveSession(session: UserSession): Promise<void> {
    this.activeSessions.set(session.id, session);
    await this.sessionRepo.save(session.toDTO());
  }

  /**
   * 取得活躍會話 (供外部查詢)
   */
  public getSession(id: string): UserSession | undefined {
    return this.activeSessions.get(id);
  }

  /**
   * 取得所有會話 ID (從持久層)
   */
  public async getAllSessionIds(): Promise<string[]> {
    return await this.sessionRepo.list();
  }
}
