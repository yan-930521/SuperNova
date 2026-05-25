import { BaseMessage, mapStoredMessagesToChatMessages, HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { MessageRole } from '../task/types';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { SessionDTO } from '../infra/types/storage';
import { SystemEventType } from '../infra/types/events';

/**
 * 會話狀態 Enum
 */
export enum SessionStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  INTERRUPTED = 'INTERRUPTED',
  CRASHED = 'CRASHED'
}

/**
 * 會話層核心接口
 * 負責追蹤與使用者的對話歷史以及高層次的 Worker 執行摘要。
 */
export interface ISession {
  /** 會話 UUID */
  id: string;
  /** 隸屬的用戶 ID */
  userId: string;
  /** 負責此會話的主代理 ID */
  responsibleAgentId: string;
  /** 當前狀態 */
  status: SessionStatus;
  /** 初始目標 */
  goal: string;
  /** 對話歷史 (總帳) - 使用 LangGraph 標準格式 */
  history: BaseMessage[];
  
  /** 新增訊息到對話歷史 */
  addMessage(role: MessageRole, content: string, metadata?: Record<string, any>): void;
  /** 轉換為 DTO 用於持久化 */
  toDTO(): SessionDTO;
  /** 從 DTO 加載狀態 */
  initFromDTO(dto: SessionDTO): Promise<void>;
}

/**
 * Session (會話層實體)
 * 負責維護與用戶的「溝通連貫性」。
 * 它被定義為一個輕量級、面向對話的記錄器。
 */
export class Session implements ISession {
  /** 會話狀態管理 */
  public status: SessionStatus = SessionStatus.IDLE;
  
  /** 
   * 對話歷史：系統的「會話總帳」
   * 採用 LangChain 的 BaseMessage 格式，以便直接與推理引擎對接。
   */
  public history: BaseMessage[] = [];
  
  /** 額外元數據存儲 */
  protected _metadata: Record<string, any> = {};

  /**
   * 初始化 Session 並設置事件訂閱
   */
  constructor(
    public id: string, 
    public goal: string, 
    public responsibleAgentId: string,
    public userId: string = 'default-user'
  ) {
    this.setupSubscribers();
  }

  /**
   * 設置事件訂閱
   */
  private setupSubscribers() {
    const bus = GlobalRuntime.getInstance().eventBus;
    
    // 訂閱 Worker 摘要事件
    // 註：此處假設 TASK_COMPLETED 包含摘要資訊，或維持原有 SystemEvent 邏輯
    bus.subscribe(SystemEventType.TASK_COMPLETED, (event) => {
      if (event.sessionId === this.id) {
        this.addMessage(MessageRole.WORKER, event.payload.summary || 'Task completed', { taskId: event.payload.taskId });
      }
    });

    // 訂閱生命週期事件
    bus.subscribe(SystemEventType.SESSION_CREATED, (event) => {
      if (event.sessionId === this.id) this.status = SessionStatus.RUNNING;
    });

    // 其他事件可依需求擴展...
  }

  /**
   * 新增訊息到對話歷史
   * @param role 角色 (Enum)
   * @param content 訊息內容
   * @param metadata 額外元數據 (例如 tool_call_id)
   */
  addMessage(role: MessageRole, content: string, metadata: Record<string, any> = {}) {
    let message: BaseMessage;

    switch (role) {
      case MessageRole.USER:
        message = new HumanMessage({ content });
        break;
      case MessageRole.ASSISTANT:
        message = new AIMessage({ content });
        break;
      case MessageRole.SYSTEM:
        message = new SystemMessage({ content });
        break;
      case MessageRole.TOOL:
        message = new ToolMessage({ 
          content, 
          tool_call_id: metadata.tool_call_id || `tool-${Date.now()}` 
        });
        break;
      case MessageRole.WORKER:
        // Worker 摘要在對話歷史中視為 AI 的一種行為觀察
        message = new AIMessage({ 
          content: `[Worker Observation] ${content}`,
          additional_kwargs: { is_worker_summary: true, ...metadata }
        });
        break;
      default:
        message = new SystemMessage({ content: `[${role}] ${content}` });
    }

    this.history.push(message);
  }

  /**
   * 轉換為 DTO
   */
  toDTO(): SessionDTO {
    return {
      id: this.id,
      userId: this.userId,
      responsibleAgentId: this.responsibleAgentId,
      goal: this.goal,
      status: this.status.toString(),
      history: this.history.map(m => m.toDict()),
      metadata: this._metadata
    };
  }

  /**
   * 從 DTO 初始化
   */
  async initFromDTO(dto: SessionDTO): Promise<void> {
    this.id = dto.id;
    this.userId = dto.userId;
    this.responsibleAgentId = dto.responsibleAgentId;
    this.goal = dto.goal;
    this.status = dto.status as SessionStatus;
    
    if (dto.history && Array.isArray(dto.history)) {
      this.history = mapStoredMessagesToChatMessages(dto.history);
    }
    
    this._metadata = dto.metadata || {};
  }

  /**
   * 舊版序列化兼容 (toJSON)
   */
  toJSON(): Record<string, any> {
    return this.toDTO() as any;
  }

  /**
   * 舊版初始化兼容 (initFromJSON)
   */
  async initFromJSON(data: Record<string, any>): Promise<void> {
    return this.initFromDTO(data as any);
  }
}
