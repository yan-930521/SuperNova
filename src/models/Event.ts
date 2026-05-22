/**
 * 事件對象 (Event)
 */
export type Event<T = any> = {
  /** 事件類型 */
  type: string;
  /** 數據載體 */
  payload: T;
  /** 用於 Hook 匹配的標籤 */
  tags: string[];
  /** 全鏈路追蹤上下文 */
  trace_context: {
    session_id: string;
    trace_id: string;
  };
}
