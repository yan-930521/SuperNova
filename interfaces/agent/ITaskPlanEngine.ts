import { IAgentState } from './IAgentState';

/**
 * 任務節點定義
 */
export interface ITaskNode {
  /** 唯一識別碼 */
  id: string;
  /** 任務類型 (例如: 'RESEARCH', 'CODE', 'FILESYSTEM') */
  type: string;
  /** 具體任務目標 */
  goal: string;
  /** 所需能力標籤 (例如: ['FILE_WRITE', 'SEARCH']) */
  requiredCapabilities?: string[];
  /** 指定執行的 Agent ID (選填) */
  assignedAgentId?: string;
  /** 指定執行的 Agent Role (選填) */
  assignedRole?: string;
  /** 工具路由指引 (Grounding) */
  toolRouting?: {
    preferredTools?: string[];
    forbiddenTools?: string[];
  };
  /** 依賴的任務 ID 列表 (DAG 結構) */
  dependencies: string[];
  /** 執行狀態 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 執行結果數據 */
  result?: any;
  /** 執行配置 */
  options?: {
    timeout?: number;      // 超時限制 (ms)
    maxRetries?: number;   // 最大重試次數
    isCritical?: boolean;  // 若失敗是否導致整個 Session 停止 (預設 true)
  };
  /** 擴充數據儲存 */
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
  replan(state: IAgentState, failedNodeId: string, error: string): Promise<Partial<IAgentState>>;

  /**
   * 執行完整的規劃工作流 (LangGraph)
   */
  run(state: IAgentState): Promise<IAgentState>;
}
