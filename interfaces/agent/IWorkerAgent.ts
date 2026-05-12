import type { IAgent } from './IAgent';

/**
 * 基礎 Worker Agent 接口
 * 最底層執行單位，負責執行具體 Task。
 */
export interface IWorkerAgent extends IAgent {
  /** 
   * 執行指定的 Intent (行為描述) 
   * @param intent 行為描述對象
   */
  executeIntent(intent: any): Promise<any>;
}
