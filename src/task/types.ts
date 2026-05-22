/**
 * 任務狀態類型
 */
export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

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
  status: TaskStatus;
  result?: any;
  records: IOperationRecord[];
}
