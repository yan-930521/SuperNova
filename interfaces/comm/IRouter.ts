/**
 * 全鏈路路由器接口
 * 負責系統內部訊息的傳遞與鏈路追蹤數據的強制傳播。
 */
export interface IRouter {
  /** 
   * 路由訊息並處理 TraceContext 傳播
   * 確保所有異步通訊皆具備可追蹤性。
   * @param message 待路由的訊息對象
   */
  route(message: any): Promise<void>;
}
