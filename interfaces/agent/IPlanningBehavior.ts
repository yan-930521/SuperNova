import { IAgentComponent } from './IAgentComponent';
import { IAgentState } from './IAgentState';
import { ITaskGraph } from './ITaskPlanEngine';

/**
 * 規劃行為介面，定義代理的規劃與重新規劃能力。
 */
export interface IPlanningBehavior extends IAgentComponent {
  /**
   * 根據目標生成任務圖。
   * @param goal 任務目標
   * @param state 當前代理狀態
   */
  plan(goal: string, state: IAgentState): Promise<ITaskGraph>;
  /**
   * 當任務失敗時進行重新規劃。
   * @param failedTaskId 失敗的任務 ID
   * @param error 錯誤訊息
   * @param state 當前代理狀態
   */
  replan(failedTaskId: string, error: string, state: IAgentState): Promise<ITaskGraph>;
}
