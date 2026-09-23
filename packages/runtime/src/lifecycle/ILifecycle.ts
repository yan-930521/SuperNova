/**
 * 生命週期介面，規範系統服務與組件的初始化、啟動與停止流程
 * 強制要求完整實作三階段生命週期函式
 */
export interface ILifecycle {
  /**
   * 初始化階段：設定基礎配置、驗證相依、建立連線
   */
  initialize(): Promise<void>;

  /**
   * 啟動階段：開始業務邏輯、啟動監聽、背景排程
   */
  start(): Promise<void>;

  /**
   * 停止階段：釋放資源、關閉連線、中斷定時器
   */
  stop(): Promise<void>;
}
