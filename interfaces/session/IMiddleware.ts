/**
 * 中間件執行上下文
 */
export interface IMiddlewareContext {
  /** 會話 ID */
  session_id: string;
  /** 目標對象 (例如 Tool 名稱或 Agent ID) */
  target: string;
  /** 傳遞的數據 */
  data: any;
  /** 額外的元數據 (例如任務 metadata) */
  metadata?: any;
}

/**
 * 中間件接口
 * 用於在 Session 執行流水線中插入自定義邏輯。
 */
export interface IMiddleware {
  /**
   * 執行中間件邏輯
   * @param ctx 執行上下文
   * @param next 調用流水線中的下一個中間件
   */
  execute(ctx: IMiddlewareContext, next: () => Promise<void>): Promise<void>;
}
