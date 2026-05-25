import { TaskNode, TaskStatus } from './types';

/**
 * 環境投影數據介面 (Context Projection)
 * 用於預測任務執行後的環境變化。
 */
export interface IContextProjection {
  /** 預期的環境快照描述 */
  expectedSnapshot: string;
  /** 關鍵產出物列表 */
  keyDeliverables: string[];
  /** 新增的約束條件 */
  newConstraints: string[];
}

/**
 * 規劃審查結果介面 (Plan Review)
 */
export interface IPlanReview {
  /** 評分 (1-10) */
  score: number;
  /** 評分理由 */
  rationale: string;
}

/**
 * 任務展開響應介面
 */
export interface ITaskExpandResponse {
  /** 展開後的子任務節點列表 */
  nodes: TaskNode[];
}

/**
 * 規劃器內部狀態介面 (用於 LangGraph 運作)
 */
export interface IPlanningState {
  /** 原始目標 */
  goal: string;
  /** 里程碑列表 */
  milestones: string[];
  /** 環境投影 */
  projectedContext: IContextProjection;
  /** 最近的審查分數 */
  reviewScore: number;
  /** 當前生成的任務節點 */
  nodes: TaskNode[];
  /** 執行時元數據 */
  metadata: Record<string, any>;
}

/**
 * 任務執行上下文介面
 */
export interface ITaskExecutionContext {
  /** 會話總體目標 */
  sessionGoal: string;
  /** 父級上下文數據 */
  parentContext: Record<string, any>;
}
