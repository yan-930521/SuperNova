import type { IWorkerAgent } from './IWorkerAgent';

/**
 * 評價者 Agent 接口
 * 專職負責對思路或規劃進行評分與審核
 */
export interface IEvaluatorAgent extends IWorkerAgent {
  /**
   * 對一組對象進行批次評分 (思路分支或任務圖)
   * @param targets 待評分對象列表
   * @param criteria 評分標準或上下文
   */
  evaluateBatch(targets: any[], criteria: any): Promise<{ score: number; rationale: string }[]>;
}
