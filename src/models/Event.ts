/**
 * 事件對象 (Event)
 */
export type Event<T = any> = {
  /** 事件類型 */
  type: string;
  /** 數據載體 */
  payload: T;
  /** 事件發生時間戳 */
  timestamp: number;
  /** 會話 ID (可選) */
  session_id?: string;
  /** 追蹤 ID (可選) */
  trace_id?: string;
}
