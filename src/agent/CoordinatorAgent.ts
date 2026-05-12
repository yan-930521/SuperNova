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
   */
  async planTaskGraph(goal: string): Promise<any> {
    console.log(`[CoordinatorAgent ${this.id}] Planning task graph for goal: ${goal}`);
    
    if (!this.planEngine) {
      throw new Error(`TaskPlanEngine not injected into CoordinatorAgent ${this.id}`);
    }

    // 1. 建立初始狀態
    const initialState = this.createInitialState(goal);

    // 2. 執行規劃引擎 (LangGraph 流程)
    const finalState = await this.planEngine.run(initialState);

    // 3. 轉換為 Session Runtime 可用的格式
    if (!finalState.planning.taskGraph) {
      throw new Error(`TaskPlanEngine failed to produce a TaskGraph for goal: ${goal}`);
    }

    return this.convertToRuntimeGraph(finalState.planning.taskGraph);
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

  /**
   * 將邏輯 TaskGraph 轉換為 Session Runtime 的數據結構
   */
  private convertToRuntimeGraph(logicalGraph: ITaskGraph): any {
    const nodes: [string, any][] = [];
    const adjList: [string, string[]][] = [];
    const inDegreeMap: [string, number][] = [];

    // 用於構建鄰接表 (Successors)
    const successorMap = new Map<string, string[]>();
    
    // 1. 初始化所有節點
    logicalGraph.nodes.forEach(node => {
      nodes.push([node.id, { 
        goal: node.goal, 
        type: node.type,
        assignedRole: node.assignedRole,
        metadata: node.metadata 
      }]);
      successorMap.set(node.id, []);
      inDegreeMap.push([node.id, node.dependencies.length]);
    });

    // 2. 建立邊的關係 (從依賴列表反轉為鄰接表)
    logicalGraph.nodes.forEach(node => {
      node.dependencies.forEach(parentId => {
        const successors = successorMap.get(parentId);
        if (successors) {
          successors.push(node.id);
        } else {
          console.warn(`[CoordinatorAgent] Task ${node.id} depends on non-existent task ${parentId}`);
        }
      });
    });

    // 3. 轉換為數組格式
    successorMap.forEach((successors, parentId) => {
      adjList.push([parentId, successors]);
    });

    return {
      nodes,
      adjList,
      inDegreeMap
    };
  }
}
