import { TaskNode, ChainStatus, TaskStatus, SystemEvent, LogType, ITaskRequest, ITaskChainState } from './types';

/**
 * 環境投影數據介面
 */
export interface IContextProjection {
  expectedSnapshot: string;
  keyDeliverables: string[];
  newConstraints: string[];
}

/**
 * 規劃審查結果介面
 */
export interface IPlanReview {
  score: number;
  rationale: string;
}

/**
 * 任務展開響應介面
 */
export interface ITaskExpandResponse {
  nodes: TaskNode[];
}

/**
 * 規劃器內部狀態介面 (用於 LangGraph)
 */
export interface IPlanningState {
  goal: string;
  milestones: string[];
  projectedContext: IContextProjection;
  reviewScore: number;
  nodes: TaskNode[];
  metadata: Record<string, any>;
}

/**
 * 任務執行上下文介面
 */
export interface ITaskExecutionContext {
  sessionGoal: string;
  parentContext: Record<string, any>;
}
