import { BaseAgent } from './BaseAgent';
import type { ICoordinator } from '../../interfaces/agent/ICoordinator';
import type { IMutationRequest } from '../../interfaces/models/IMutationRequest';
import type { ITaskPlanEngine, ITaskGraph } from '../../interfaces/agent/ITaskPlanEngine';
import type { IAgentState } from '../../interfaces/agent/IAgentState';

/**
 * CoordinatorAgent 類
 * 負責協調多個 Agent 的提議並進行衝突裁決，以及利用 TaskPlanEngine 進行任務規劃。
 */
export class CoordinatorAgent extends BaseAgent implements ICoordinator {
  constructor(private planEngine?: ITaskPlanEngine) {
    super();
  }

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
   * @param availableAgents 當前系統中可用的 Agent 列表 (可選)
   */
  async planTaskGraph(goal: string, availableAgents?: any[]): Promise<ITaskGraph> {
    console.log(`[CoordinatorAgent ${this.id}] Planning task graph for goal: ${goal}`);
    
    if (!this.planEngine) {
      throw new Error(`TaskPlanEngine not injected into CoordinatorAgent ${this.id}`);
    }

    // 1. 建立初始狀態，並注入可用 Agent 資訊
    const initialState = this.createInitialState(goal);
    if (availableAgents) {
      initialState.metadata = {
        ...initialState.metadata,
        available_agents: availableAgents.map(a => ({
          id: a.id,
          role: a.role,
          capabilities: a.capabilities || []
        }))
      };
    }

    // 2. 執行規劃引擎 (LangGraph 流程)
    const finalState = await this.planEngine.run(initialState);

    // 3. 檢查規劃結果
    if (!finalState.planning.taskGraph) {
      throw new Error(`TaskPlanEngine failed to produce a TaskGraph for goal: ${goal}`);
    }

    return finalState.planning.taskGraph;
  }

  /**
   * 當任務失敗時，請求重新規劃任務圖
   * @param goal 原始目標
   * @param failedTaskId 失敗的任務 ID
   * @param error 錯誤訊息
   * @param currentState 當前 Agent 狀態
   * @param availableAgents 當前系統中可用的 Agent 列表 (可選)
   */
  async requestReplan(
    goal: string, 
    failedTaskId: string, 
    error: string, 
    currentState: IAgentState,
    availableAgents?: any[]
  ): Promise<ITaskGraph> {
    console.log(`[CoordinatorAgent ${this.id}] Requesting replan for failed task: ${failedTaskId}`);

    if (!this.planEngine) {
      throw new Error(`TaskPlanEngine not injected into CoordinatorAgent ${this.id}`);
    }

    // 注入可用 Agent 資訊到當前狀態（如果提供）
    if (availableAgents) {
      currentState.metadata = {
        ...currentState.metadata,
        available_agents: availableAgents.map(a => ({
          id: a.id,
          role: a.role,
          capabilities: a.capabilities || []
        }))
      };
    }

    // 1. 執行規劃引擎的重新規劃邏輯
    const replanResult = await this.planEngine.replan(currentState, failedTaskId, error);

    // 2. 獲取更新後的任務圖
    const updatedTaskGraph = replanResult.planning?.taskGraph;

    if (!updatedTaskGraph) {
      throw new Error(`TaskPlanEngine failed to produce an updated TaskGraph during replan for goal: ${goal}`);
    }

    return updatedTaskGraph;
  }

  /**
   * 建立初始規劃狀態
   */
  private createInitialState(goal: string): IAgentState {
    return {
      goal,
      currentTask: "",
      messages: [],
      thoughtTree: {
        nodes: [],
        rootId: null,
        activeNodeId: null,
        iterationCount: 0,
      },
      planning: {
        milestones: [],
        currentMilestoneIdx: 0,
        taskGraph: null,
        projectedContext: {},
      },
      lastEvaluations: [],
      errors: [],
      metadata: {
        agentId: this.id,
        role: this.role
      }
    };
  }

}
