import type { IWorkerAgent } from './IWorkerAgent';

/**
 * 程式碼專家 Agent 接口
 */
export interface ICoderAgent extends IWorkerAgent {
  /** 
   * 編譯或檢查程式碼 
   * @param source 原始碼內容
   */
  compile(source: string): Promise<{ success: boolean; errors?: string[] }>;

  /** 
   * 進行程式碼審查 
   * @param diff 變更差異
   */
  reviewCode(diff: string): Promise<string>;
}
