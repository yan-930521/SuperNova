/**
 * 任務狀態類型
 */
export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed';

/**
 * 任務節點定義 (TaskNode)
 */
export interface TaskNode {
  id: string;
  type: string;
  goal: string;
  requiredCapabilities?: string[];
  assignedAgentId?: string | null;
  assignedRole?: string | null;
  toolRouting?: {
    preferredTools?: string[];
    forbiddenTools?: string[];
  };
  dependencies: string[];
  status: TaskStatus;
  result?: any;
  options?: {
    timeout?: number;
    maxRetries?: number;
    isCritical?: boolean;
  };
  metadata?: Record<string, any>;
}

/**
 * 任務圖資料結構 (TaskGraphData)
 */
export interface TaskGraphData {
  nodes: TaskNode[];
  milestones: string[];
  currentMilestoneIndex: number;
}

/**
 * 單次操作記錄介面
 */
export interface IOperationRecord {
  taskId: string;
  action: string;      // 例如 "TOOL_CALL: Tavily"
  summary: string;     // Worker 產出的 Action Summary
  input?: any;
  output?: any;
  error?: string;
  timestamp: number;
}

/**
 * 任務節點狀態介面
 */
export interface ITaskNodeState {
  id: string;
  type: string;
  goal: string;
  status: TaskStatus;
  
  // 指派資訊
  assignedAgentId?: string | null;
  assignedRole?: string | null;
  requiredCapabilities?: string[];

  // 執行細節與紀錄
  result?: any;
  records: IOperationRecord[];

  // 依賴與配置
  dependencies: string[];
  options?: {
    timeout?: number;
    maxRetries?: number;
    isCritical?: boolean;
  };
  metadata?: Record<string, any>;
}
