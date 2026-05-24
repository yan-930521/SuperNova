import { BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage, mapStoredMessagesToChatMessages } from '@langchain/core/messages';
import { SystemEvent, MessageRole } from '../task/types';
import { GlobalRuntime } from '../runtime/GlobalRuntime';

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
  /** 序列化為 JSON，用於持久化 */
  toJSON(): Record<string, any>;
  /** 從 JSON 加載狀態，用於恢復會話 */
  initFromJSON(data: Record<string, any>): Promise<void>;
}

/**
 * Session (會話層總帳)
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
  constructor(public id: string, public goal: string, public responsibleAgentId: string) {
    this.setupSubscribers();
  }

  /**
   * 設置事件訂閱
   */
  private setupSubscribers() {
    const bus = GlobalRuntime.getInstance().eventBus;
    
    // 訂閱 Worker 摘要事件
    bus.subscribe(SystemEvent.ACTION_SUMMARY, (event) => {
      if (event.session_id === this.id) {
        this.addMessage(MessageRole.WORKER, event.payload.summary, { taskId: event.payload.taskId });
      }
    });

    // 訂閱生命週期事件
    bus.subscribe(SystemEvent.SESSION_START, (event) => {
      if (event.session_id === this.id) this.status = SessionStatus.RUNNING;
    });

    bus.subscribe(SystemEvent.SESSION_COMPLETE, (event) => {
      if (event.session_id === this.id) this.status = SessionStatus.COMPLETED;
    });

    bus.subscribe(SystemEvent.SESSION_INTERRUPT, (event) => {
      if (event.session_id === this.id) this.status = SessionStatus.INTERRUPTED;
    });
    
    bus.subscribe(SystemEvent.SESSION_CRASH, (event) => {
      if (event.session_id === this.id) this.status = SessionStatus.CRASHED;
    });
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
   * 序列化為 JSON
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      goal: this.goal,
      responsibleAgentId: this.responsibleAgentId,
      status: this.status,
      // 使用 LangChain 內建序列化
      history: this.history.map(m => m.toDict()),
      metadata: this._metadata
    };
  }

  /**
   * 從 JSON 數據初始化
   */
  async initFromJSON(data: Record<string, any>): Promise<void> {
    this.id = data.id || this.id;
    this.goal = data.goal || this.goal;
    this.responsibleAgentId = data.responsibleAgentId || 'unknown';
    this.status = data.status || this.status;
    
    // 反序列化為正確的 Message 類別實例
    if (data.history && Array.isArray(data.history)) {
      this.history = mapStoredMessagesToChatMessages(data.history);
    } else {
      this.history = [];
    }
    
    this._metadata = data.metadata || {};
  }
}
