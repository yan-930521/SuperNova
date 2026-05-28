import { MessageDTO } from './session';

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
  FAILED = 'failed',
  STUCK = 'stuck'
}

/**
 * 任務日誌分類 Enum
 */
export enum LogType {
  SYSTEM = 'SYSTEM',
  LIFECYCLE = 'LIFECYCLE',
  PLAN = 'PLAN',
  TOOL = 'TOOL',
  THOUGHT = 'THOUGHT'
}

/**
 * 任務數據傳輸對象 (Task Data Transfer Object)
 * 代表執行層中的單一任務節點。
 */
export interface TaskDTO {
  /** 任務唯一識別碼 */
  id: string;
  /** 任務詳細描述、上下文 */
  description: string;
  /** 所屬的會話 ID */
  sessionId: string;
  /** 所屬的任務鏈 ID */
  chainId: string;
  /** 任務類型，如 'work', 'research', 'code' 等 */
  type: string;
  /** 任務具體要達成的目標 */
  goal: string;
  /** 執行狀態 */
  status: TaskStatus;
  /** 依賴的前置任務 ID 列表 */
  dependencies: string[];
  /** 任務內部的執行歷史 (ReAct 軌跡) */
  history: MessageDTO[];
  /** 被指派執行此任務的代理 ID */
  assignedAgentId?: string | null;
  /** 執行此任務所需的能力標籤 */
  requiredCapabilities?: string[];
  /** 工具路由配置：限制或偏好使用的工具集 */
  toolRouting?: {
    /** 優先使用的工具名稱列表 */
    preferredTools?: string[];
    /** 嚴禁使用的工具名稱列表 */
    forbiddenTools?: string[];
  };
  /** 執行選項與策略 */
  options?: {
    /** 執行超時限制 (毫秒) */
    timeout?: number;
    /** 失敗後的最大重試次數 */
    maxRetries?: number;
    /** 是否為關鍵任務 (若失敗則終止整個鏈) */
    isCritical?: boolean;
  };
  /** 執行產出的結果數據 */
  result?: string;
  /** 當前已重試次數 */
  retryCount?: number;
  /** 任務相關的額外元數據 */
  metadata?: Record<string, any>;
}

/**
 * 任務儲存庫接口
 * 負責 TaskDTO 的持久化。
 */
export interface ITaskRepository {
  /** 保存或更新任務 */
  save(task: TaskDTO): Promise<void>;
  /** 根據 ID 查找單一任務 */
  findById(id: string): Promise<TaskDTO | null>;
}

/**
 * 任務請求介面 (用於 TaskManager Inbox)
 */
export interface ITaskRequest {
  goal: string;
  description: string;
  sessionId: string;
  chainId: string;
  traceId: string;
  requesterId: string;
}

/**
 * 任務鏈狀態摘要
 */
export interface IChainStatusSummary {
  chainId: string;
  status: ChainStatus;
  nodes: TaskDTO[];
  sessionId?: string;
  goal?: string;
}

/**
 * 任務圖資料結構 (TaskGraphData)
 */
export interface TaskGraphData {
  nodes: TaskDTO[];
  milestones: string[];
  currentMilestoneIndex: number;
}