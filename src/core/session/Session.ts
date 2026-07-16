import { IEntity } from '../infra/persistence/IRepository';
import { DataBlock, DataBlockData } from '../messaging/DataBlock';

/**
 * SessionState
 * 代表會話目前在生命週期中的狀態。
 */
export enum SessionState {
  /** 活躍中，Agent/Worker 正在執行 */
  ACTIVE = 'ACTIVE',
  /** 系統優雅停機時被主動凍結掛起的狀態 */
  SUSPENDED = 'SUSPENDED',
  /** 人機協同掛起中，等待外部審批或使用者反饋 */
  INTERRUPTED = 'INTERRUPTED',
  /** 會話任務順利完成 */
  COMPLETED = 'COMPLETED',
  /** 遭遇不可恢復錯誤或熔斷而失敗 */
  FAILED = 'FAILED',
  /** 已歸檔（長期閒置，記憶體釋放，可隨時重新溫啟動） */
  ARCHIVED = 'ARCHIVED'
}

/**
 * 序列化會話資料介面
 */
export interface SessionData {
  id: string;
  mainAgentId: string;
  status: SessionState;
  metadata: Record<string, any>;
  registeredAgentIds: string[];
  createdAt: number;
  updatedAt: number;
  inboxBuffer: Record<string, any[]>;
}

/**
 * Session 實體類別
 * 代表一個用戶與 MainAgent 的完整對話生命週期與資料邊界。
 * 內建 InboxBuffer 用於暫存發送給休眠/掛起 Agent 的 DataBlock 訊息。
 */
export class Session implements IEntity {
  public readonly id: string;
  public readonly mainAgentId: string;
  public status: SessionState;
  public metadata: Record<string, any>;
  public readonly registeredAgentIds: Set<string>;
  public readonly createdAt: number;
  public updatedAt: number;
  private readonly inboxBuffer: Map<string, DataBlock[]> = new Map();

  constructor(params: {
    id: string;
    mainAgentId: string;
    status?: SessionState;
    metadata?: Record<string, any>;
    registeredAgentIds?: string[];
    createdAt?: number;
    updatedAt?: number;
    inboxBuffer?: Record<string, DataBlockData[]>;
  }) {
    this.id = params.id;
    this.mainAgentId = params.mainAgentId;
    this.status = params.status || SessionState.ACTIVE;
    this.metadata = params.metadata || {};
    this.registeredAgentIds = new Set(params.registeredAgentIds || []);
    this.createdAt = params.createdAt || Date.now();
    this.updatedAt = params.updatedAt || Date.now();

    // 反序列化 InboxBuffer
    if (params.inboxBuffer) {
      for (const [agentId, blocks] of Object.entries(params.inboxBuffer)) {
        this.inboxBuffer.set(
          agentId,
          blocks.map(b => new DataBlock(b))
        );
      }
    }
  }

  /**
   * 註冊一個 Agent ID 到會話中，記錄該會話所產生的所有 Agent 軌跡
   */
  public registerAgentId(agentId: string): void {
    if (!this.registeredAgentIds.has(agentId)) {
      this.registeredAgentIds.add(agentId);
      this.touch();
    }
  }

  /**
   * 暫存訊息 (DataBlock) 至特定 Agent 的收件箱
   */
  public pushToInbox(agentId: string, block: DataBlock): void {
    if (!this.inboxBuffer.has(agentId)) {
      this.inboxBuffer.set(agentId, []);
    }
    this.inboxBuffer.get(agentId)!.push(block);
    this.touch();
  }

  /**
   * 拉取並提取特定 Agent 收件箱中的所有暫存訊息 (提取後清空)
   */
  public popFromInbox(agentId: string): DataBlock[] {
    const blocks = this.inboxBuffer.get(agentId) || [];
    this.inboxBuffer.delete(agentId);
    this.touch();
    return blocks;
  }

  /**
   * 獲取特定 Agent 收件箱的暫存訊息數量
   */
  public getInboxSize(agentId: string): number {
    return (this.inboxBuffer.get(agentId) || []).length;
  }

  /**
   * 更新最後活躍時間
   */
  public touch(): void {
    this.updatedAt = Date.now();
  }

  /**
   * 序列化會話資料
   */
  public toJSON(): SessionData {
    const inboxObj: Record<string, any[]> = {};
    for (const [agentId, blocks] of this.inboxBuffer.entries()) {
      inboxObj[agentId] = blocks.map(b => ({
        sessionId: b.sessionId,
        threadId: b.threadId,
        senderId: b.senderId,
        targetId: b.targetId,
        type: b.type,
        controlPayload: b.controlPayload,
        dataPointers: b.dataPointers
      }));
    }

    return {
      id: this.id,
      mainAgentId: this.mainAgentId,
      status: this.status,
      metadata: this.metadata,
      registeredAgentIds: Array.from(this.registeredAgentIds),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      inboxBuffer: inboxObj
    };
  }

  /**
   * 從 JSON 資料還原 Session 實例
   */
  public static fromJSON(data: SessionData): Session {
    return new Session({
      id: data.id,
      mainAgentId: data.mainAgentId,
      status: data.status,
      metadata: data.metadata,
      registeredAgentIds: data.registeredAgentIds,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      inboxBuffer: data.inboxBuffer
    });
  }
}
