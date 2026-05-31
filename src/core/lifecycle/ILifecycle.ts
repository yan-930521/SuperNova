/**
 * 生命週期介面，規範組件的初始化、啟動與停止流程
 */
export interface ILifecycle {
  /**
   * 初始化組件，通常用於設定基礎配置或建立必要的連線
   */
  initialize(): Promise<void>;

  /**
   * 啟動組件，開始執行業務邏輯
   */
  start(): Promise<void>;

  /**
   * 停止組件，釋放資源並關閉連線
   */
  stop(): Promise<void>;
}
