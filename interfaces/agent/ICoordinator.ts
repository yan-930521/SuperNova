import type { IAgent } from './IAgent';
import type { MutationRequest } from '../../src/models/MutationRequest';

/**
 * 協調者 Agent 接口 (Coordinator)
 * 繼承自 IAgent，具備多 Agent 衝突裁決與任務規劃能力。
 */
export interface ICoordinator extends IAgent {
  /** 
   * 執行階層式衝突裁決，篩選出可執行的變更提議
   * @param proposals 原始變更請求列表
   */
  arbitrateMutations(proposals: MutationRequest[]): Promise<MutationRequest[]>;

  /** 
   * 基於目標生成任務的有向無環圖 (DAG)
   * @param goal 任務目標描述
   */
  planTaskGraph(goal: string): Promise<any>;

  /**
   * 當任務失敗時，請求重新規劃任務圖
   * @param goal 原始目標
   * @param failedTaskId 失敗的任務 ID
   * @param error 錯誤訊息
   * @param currentState 當前 Agent 狀態
   */
  requestReplan(goal: string, failedTaskId: string, error: string, currentState: any): Promise<any>;
}
