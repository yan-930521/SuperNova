import { IAgentState } from './IAgentState';

/**
 * 任務節點定義
 */
export interface ITaskNode {
  id: string;
  type: string;
  goal: string;
  assignedRole?: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  metadata?: Record<string, any>;
}

/**
 * 任務圖 (DAG) 結構
 */
export interface ITaskGraph {
  nodes: ITaskNode[];
  milestones: string[];
  currentMilestoneIndex: number;
}

/**
 * 任務規劃引擎接口
 * 整合了 LangGraph 節點行為邏輯
 */
export interface ITaskPlanEngine {
  /**
   * [Node] 將全局目標拆解為里程碑
   */
  planMilestones(state: IAgentState): Promise<Partial<IAgentState>>;

  /**
   * [Node] 針對特定里程碑展開具體的任務圖 (DAG)
   */
  expandMilestone(state: IAgentState): Promise<Partial<IAgentState>>;

  /**
   * [Node] 審查規劃與預測未來上下文
   */
  reviewAndProject(state: IAgentState): Promise<Partial<IAgentState>>;

  /**
   * 重新規劃路徑
   */
  replan(failedNodeId: string): Promise<ITaskGraph>;

  /**
   * 執行完整的規劃工作流 (LangGraph)
   */
  run(state: IAgentState): Promise<IAgentState>;
}
