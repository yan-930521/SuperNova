/**
 * 操作日誌接口 (OpLog)
 * 用於全鏈路因果追蹤。
 */
export interface IOpLog {
  /** 寫入一條日誌記錄 */
  append(type: string, payload: any): Promise<void>;

  /** 
   * 查詢符合條件的日誌流 
   * @param filter 過濾條件
   */
  query(filter: Record<string, any>): Promise<any[]>;

  /** 
   * 週期性壓縮日誌為摘要
   * 通過專職 Agent 將冗長的操作日誌壓縮為結構化摘要，對抗上下文熵增。
   * @param summaryAgent 負責摘要生成的 Agent 實例
   */
  compress(summaryAgent: any): Promise<string>;
}
