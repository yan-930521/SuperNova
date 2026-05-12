import { IAgentComponent } from './IAgentComponent';
import { IAgentState } from './IAgentState';

/**
 * 推理行為介面，定義代理的思考與狀態更新能力。
 */
export interface IReasoningBehavior extends IAgentComponent {
  /**
   * 執行推理過程並返回建議的狀態更新。
   * @param state 當前代理狀態
   */
  think(state: IAgentState): Promise<Partial<IAgentState>>;
}
