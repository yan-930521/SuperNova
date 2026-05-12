import type { IWorkerAgent } from './IWorkerAgent';

/**
 * 研究者 Agent 接口 (Researcher Agent)
 * 專注於外部資訊檢索與大規模數據摘要。
 */
export interface IResearcherAgent extends IWorkerAgent {
  /** 
   * 執行深度資訊檢索
   * @param query 檢索關鍵字
   */
  search(query: string): Promise<any[]>;

  /** 
   * 對原始數據進行歸納摘要
   * @param data 待處理的原始數據
   */
  summarize(data: any): Promise<string>;
}
