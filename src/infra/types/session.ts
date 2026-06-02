import type { BaseMessage } from '@langchain/core/messages';

/**
 * 對話訊息角色 Enum
 * 定義訊息在會話歷史中的發送者身份。
 */
export enum MessageRole {
  /** 使用者 (Human) */
  USER = 'USER',
  /** 主代理 (AI Assistant) */
  ASSISTANT = 'ASSISTANT',
  /** 執行任務的 Worker */
  WORKER = 'WORKER',
  /** 系統提示或指令 */
  SYSTEM = 'SYSTEM',
  /** 工具執行結果 */
  TOOL = 'TOOL'
}

/**
 * 訊息數據傳輸對象 (Message Data Transfer Object)
 * 用於封裝 LangChain 訊息及其關聯的業務元數據。
 */
export interface MessageDTO {
  /** LangChain 原始訊息對象 */
  message: BaseMessage;
  /** 
   * 訊息發送時的身分數據
   * 獨立於 BaseMessage 存儲，確保身分溯源性。
   */
  identity: {
    /** 訊息作者的唯一識別碼 (Agent ID 或 User ID) */
    authorId: string;
    role: MessageRole;
    name?: string;
    [key: string]: any;
  };
}

/**
 * 會話數據傳輸對象 (Session Data Transfer Object)
 * 紀錄使用者與 AI 之間的高層次對話狀態與歷史摘要。
 * 對齊 src/models/Session.ts 中的業務實體。
 */
export interface SessionDTO {
  /** 會話唯一識別碼 */
  id: string;
  /** 隸屬的用戶 ID */
  userId: string;
  /** 負責此會話的主代理 (Main Agent) ID */
  responsibleAgentId: string;
  /** 會話狀態：IDLE | RUNNING | COMPLETED | INTERRUPTED | CRASHED */
  status: string;
  /** 對話歷史序列：存儲封裝後的 MessageDTO 對象 */
  history: MessageDTO[];
  /** 額外的業務元數據 */
  metadata: Record<string, any>;
}
