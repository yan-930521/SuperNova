import { MainAgent } from '../../agent/MainAgent';
import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import {
    Commands, Events, ICommand, ICommandBus, IEvent, IEventBus
} from '../../core/messaging/IBus';
import { UserSession } from '../../domain/session/UserSession';
import { recorder } from '../../infra/LogManager';
import { IEntity, ISessionRepository } from '../../infra/persistence/IRepository';
import { MessageDTO, MessageRole } from '../../infra/types/session';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { AgentService } from '../agent/AgentService';
import { DispatchTaskCommand } from '../task/TaskService';

/**
 * 啟動會話指令的 Payload 介面
 */
export interface IStartSessionPayload {
  sessionId: string;
  userId: string;
  agentId: string;
}

/**
 * 啟動會話指令類別
 */
export class StartSessionCommand implements ICommand<Commands.Session.Start> {
  readonly type = Commands.Session.Start;
  constructor(public readonly payload: IStartSessionPayload) { }
}

/**
 * 發送訊息指令的 Payload
 */
export interface ISendMessagePayload {
  sessionId: string;
  userId: string;
  content: string;
}

/**
 * 發送訊息指令類別
 */
export class SendMessageCommand implements ICommand<Commands.Session.SendMessage> {
  readonly type = Commands.Session.SendMessage;
  constructor(public readonly payload: ISendMessagePayload) { }
}

/**
 * SessionService (會話服務)
 * 負責協調人機對話生命週期、管理 UserSession 實體與持久化。
 */
export class SessionService implements ILifecycle {
  /** 記憶體中的活躍會話緩存 */
  private activeSessions = new Map<string, UserSession>();

  constructor(
    private readonly commandBus: ICommandBus,
    private readonly eventBus: IEventBus,
    private readonly sessionRepo: ISessionRepository<any, any>
  ) { }

  /**
   * 生命週期：初始化，註冊指令處理器與事件訂閱
   */
  async initialize(): Promise<void> {
    // 註冊指令處理器
    this.commandBus.registerHandler(Commands.Session.Start, this.handleStartSession.bind(this));
    this.commandBus.registerHandler(Commands.Session.SendMessage, this.handleSendMessage.bind(this));

    // 訂閱「任務完成」事件
    this.eventBus.subscribe(Events.Task.Finished, this.onTaskFinished.bind(this));

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
  private async handleStartSession(command: StartSessionCommand): Promise<{ success: boolean }> {
    const { sessionId, userId, agentId } = command.payload;

    recorder.info(`[SessionService] Initializing session: ${sessionId} for user: ${userId}`, { type: 'SYSTEM' });

    let sessionEntity: UserSession;
    const dto = await this.sessionRepo.load(sessionId);

    if (dto) {
      sessionEntity = new UserSession(dto.id, dto.userId, dto.responsibleAgentId, dto.status);
      sessionEntity.setHistory(dto.history);
      sessionEntity.metadata = dto.metadata || {};
    } else {
      sessionEntity = new UserSession(sessionId, userId, agentId);
    }

    this.activeSessions.set(sessionId, sessionEntity);
    await this.sessionRepo.save(sessionEntity.toDTO());

    // 發布會話已啟動事件 (通知系統環境已就緒)
    this.eventBus.publish({
      type: Events.Session.Started,
      timestamp: Date.now(),
      payload: { sessionId, userId }
    });

    return { success: true };
  }

  /**
   * 處理發送新訊息指令 (此處攜帶實際目標並觸發執行鏈)
   */
  private async handleSendMessage(command: SendMessageCommand): Promise<{ success: boolean }> {
    const { sessionId, userId, content } = command.payload;

    let session = this.activeSessions.get(sessionId);
    if (!session) {
      const dto = await this.sessionRepo.load(sessionId);
      if (!dto) throw new Error(`Session ${sessionId} not found. Please start session first.`);

      session = new UserSession(dto.id, dto.userId, dto.responsibleAgentId, dto.status);
      session.setHistory(dto.history);
      session.metadata = dto.metadata || {};
      this.activeSessions.set(sessionId, session);
    }

    recorder.info(`[SessionService] Received message in session: ${sessionId}`, { type: 'SYSTEM' });

    // 1. 添加訊息並增量保存
    const message = session.addMessage(userId, MessageRole.USER, content);
    await this.sessionRepo.appendMessage(sessionId, message);

    // 2. 直接由 MainAgent 處理 (ReAct 思考與工具調用)
    const agentService = GlobalRuntime.getInstance().container.resolve<AgentService>('AgentService');
    const agent = agentService.getAgent(session.responsibleAgentId);

    if (agent instanceof MainAgent) {
      // 異步執行，不阻塞當前指令回傳
      agent.handleUserMessage(session, content).catch(err => {
        recorder.error(`[SessionService] MainAgent failed to handle message: ${err.message}`, { session_id: sessionId });
      });
    } else {
      recorder.warn(`[SessionService] No MainAgent found for session: ${sessionId}. Fallback to direct task dispatch.`, { type: 'SYSTEM' });
      await this.commandBus.send(
        new DispatchTaskCommand({
          chainId: `chain-${Date.now()}`,
          sessionId,
          goal: "回答使用者的訊息。",
          description: `Content: ${content}`,
          traceId: `trace-${Date.now()}`
        }));
    }

    return { success: true };
  }

  /**
   * 當任務完成時，將摘要同步回 UserSession
   */
  private async onTaskFinished(event: IEvent<Events.Task.Finished, any>): Promise<void> {
    const { sessionId, summary, taskId } = event.payload;
    const session = this.activeSessions.get(sessionId);

    if (session) {
      recorder.info(`[SessionService] Syncing task summary for task: ${taskId} into session: ${sessionId}`, { type: 'SYSTEM' });

      // 增加一條 Worker 訊息到會話歷史
      const message = session.addMessage('SYSTEM', MessageRole.WORKER, summary, { taskId });

      // 效能優化：增量寫入
      await this.sessionRepo.appendMessage(sessionId, message);

      // 發布會話更新事件
      this.eventBus.publish({
        type: Events.Session.Updated,
        timestamp: Date.now(),
        payload: { sessionId, taskId, lastSummary: summary }
      });
    }
  }

  /**
   * 取得活躍會話 (供外部查詢)
   */
  public getSession(id: string): UserSession | undefined {
    return this.activeSessions.get(id);
  }
}
