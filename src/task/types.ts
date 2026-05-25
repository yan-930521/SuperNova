import { TaskGraph } from '../models/TaskGraph';

/**
 * 任務請求介面 (用於 TaskManager Inbox)
 */
export interface ITaskRequest {
  goal: string;
  sessionId: string;
  chainId: string;
  traceId: string;
  requesterId: string;
}

/**
 * 任務鏈運行時狀態介面 (用於 TaskManager 追蹤)
 */
export interface ITaskChainState {
  status: ChainStatus;
  graph: TaskGraph; 
  sessionId: string;
  traceId: string;
  goal: string;
}

/**
 * 任務執行狀態 Enum
 */
export enum TaskStatus {
  PENDING = 'pending',
  READY = 'ready',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * 任務鏈/流程狀態 Enum
 */
export enum ChainStatus {
  PLANNING = 'planning',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * 系統事件類型 Enum
 */
export enum SystemEvent {
  SESSION_START = 'SESSION_START',
  SESSION_COMPLETE = 'SESSION_COMPLETE',
  SESSION_INTERRUPT = 'SESSION_INTERRUPT',
  SESSION_CRASH = 'SESSION_CRASH',
  TASK_START = 'TASK_START',
  TASK_COMPLETE = 'TASK_COMPLETE',
  ACTION_SUMMARY = 'ACTION_SUMMARY'
}

/**
 * 日誌分類 Enum
 */
export enum LogType {
  SYSTEM = 'SYSTEM',
  LIFECYCLE = 'LIFECYCLE',
  PLAN = 'PLAN',
  TOOL = 'TOOL',
  THOUGHT = 'THOUGHT'
}

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
 * 任務鏈狀態摘要
 */
export interface IChainStatusSummary {
  chainId: string;
  status: ChainStatus;
  nodes: TaskNode[];
  sessionId?: string;
  goal?: string;
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
  action: string;      
  summary: string;     
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
  assignedAgentId?: string | null;
  assignedRole?: string | null;
  requiredCapabilities?: string[];
  result?: any;
  records: IOperationRecord[];
  dependencies: string[];
  options?: {
    timeout?: number;
    maxRetries?: number;
    isCritical?: boolean;
  };
  metadata?: Record<string, any>;
}

/**
 * 對話訊息角色 Enum
 */
export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  WORKER = 'WORKER',
  SYSTEM = 'SYSTEM',
  TOOL = 'TOOL'
}

/**
 * Agent 執行上下文介面
 */
export interface IAgentExecuteContext {
  /** 會話 ID */
  sessionId: string;
  /** 全鏈路追蹤 ID */
  traceId: string;
  /** 發起執行或工具調用的 Agent ID */
  agentId: string;
  /** 當前執行的任務 ID (如果有) */
  taskId?: string;
  /** 會話的全域目標 */
  sessionGoal?: string;
  /** 額外的元數據 */
  metadata?: Record<string, any>;
}

/**
 * Agent 執行結果介面
 */
export interface IAgentExecuteResult {
  /** 執行狀態 */
  status: 'success' | 'failed';
  /** 具體產出的數據 */
  result: any;
  /** 供會話歷史使用的摘要內容 (對話式輸出) */
  summary: string;
  /** 錯誤訊息 (僅在失敗時) */
  error?: string;
  /** 建議的下一步行動 */
  next_steps?: string;
}
