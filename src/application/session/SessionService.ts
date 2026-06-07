
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
    private readonly eventBus: IEventBus,
    private readonly sessionRepo: ISessionRepository<any, any>
  ) { }

  /**
   * 生命週期：初始化，註冊指令處理器與事件訂閱
   */
  async initialize(): Promise<void> {
    // // 註冊指令處理器
    // this.eventBus.subscribe(Commands.Session.Start, this.handleStartSession.bind(this));
    // this.eventBus.subscribe(Commands.Session.SendMessage, this.handleSendMessage.bind(this));

    // // 訂閱「任務完成」事件
    // this.eventBus.subscribe(Events.Task.Finished, this.onTaskFinished.bind(this));

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
   * 處理啟動會話指令 (僅負責環境初始化)
   */
  private async handleStartSession(){}

  /**
   * 處理發送新訊息指令
   */
  private async handleSendMessage() {}

  /**
   * 取得活躍會話 (供外部查詢)
   */
  public getSession(id: string): UserSession | undefined {
    return this.activeSessions.get(id);
  }
}
