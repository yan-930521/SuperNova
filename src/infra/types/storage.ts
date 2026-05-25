/**
 * 會話數據傳輸對象 (Session Data Transfer Object)
 * 紀錄使用者與 AI 之間的高層次對話狀態與歷史摘要。
 * 對齊 src/session/Session.ts 中的業務實體。
 */
export interface SessionDTO {
  /** 會話唯一識別碼 */
  id: string;
  /** 隸屬的用戶 ID */
  userId: string;
  /** 負責此會話的主代理 (Main Agent) ID */
  responsibleAgentId: string;
  /** 使用者發起的初始目標或問題 */
  goal: string;
  /** 會話狀態：IDLE (閒置), RUNNING (執行中), COMPLETED (完成), INTERRUPTED (中斷), CRASHED (崩潰) */
  status: string;
  /** 對話歷史序列：存儲序列化後的 LangChain 訊息對象 (BaseMessage) */
  history: any[];
  /** 額外的業務元數據 */
  metadata: Record<string, any>;
}

/**
 * 會話儲存庫接口
 * 負責 SessionDTO 的持久化。
 */
export interface ISessionRepository {
  /**
   * 保存或更新會話狀態
   * @param session 會話數據對象
   */
  save(session: SessionDTO): Promise<void>;

  /**
   * 根據 ID 查找會話
   * @param id 會話識別碼
   */
  findById(id: string): Promise<SessionDTO | null>;

  /**
   * 查找特定用戶的所有會話紀錄
   * @param userId 用戶識別碼
   */
  findByUser(userId: string): Promise<SessionDTO[]>;
}
