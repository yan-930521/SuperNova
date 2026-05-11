import { BaseAgent } from './BaseAgent';
import { ICoordinator } from '../../interfaces/agent/ICoordinator';
import { IMutationRequest } from '../../interfaces/models/IMutationRequest';

/**
 * CoordinatorAgent 類
 * 負責協調多個 Agent 的提議並進行衝突裁決。
 */
export class CoordinatorAgent extends BaseAgent implements ICoordinator {
  /**
   * 執行階層式衝突裁決
   * @param proposals 原始變更請求列表
   */
  async arbitrateMutations(proposals: IMutationRequest[]): Promise<IMutationRequest[]> {
    const winners = new Map<string, IMutationRequest>();

    proposals.forEach((proposal) => {
      const existing = winners.get(proposal.target_hook);
      if (!existing) {
        winners.set(proposal.target_hook, proposal);
      } else {
        // 裁決邏輯：保留 priority 最高的一個。如果優先級相同，保留最早提交的。
        if (proposal.priority > existing.priority) {
          winners.set(proposal.target_hook, proposal);
        }
        // 如果 priority 相同，因為我們是按順序遍歷，existing 已經是較早的一個，所以不更新。
      }
    });

    return Array.from(winners.values());
  }

  /**
   * 基於目標生成任務的有向無環圖 (DAG)
   * @param goal 任務目標描述
   */
  async planTaskGraph(goal: string): Promise<any> {
    console.log(`[CoordinatorAgent ${this.id}] Planning task graph for goal: ${goal}`);
    return {};
  }
}
