import type { IAgent } from './IAgent';

/**
 * WorkerAgent 接口
 * 最底層執行單位，負責接收任務並利用其組件 (如 Reasoner, ToolRegistry) 來執行。
 */
export interface IWorkerAgent extends IAgent {
  /**
   * 處理來自 TaskGraph 的任務節點
   * @param taskNode 任務節點數據
   */
  processTask(taskNode: any): Promise<any>;
}
