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
  /** 所屬的會話 ID */
  sessionId: string;
  /** 任務類型，如 'work', 'research', 'code' 等 */
  type: string;
  /** 任務具體要達成的目標 */
  goal: string;
  /** 執行狀態 */
  status: TaskStatus;
  /** 依賴的前置任務 ID 列表 */
  dependencies: string[];
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
  result?: any;
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
  /** 獲取指定會話下的所有任務 */
  findBySession(sessionId: string): Promise<TaskDTO[]>;
  /** 根據 ID 查找單一任務 */
  findById(id: string): Promise<TaskDTO | null>;
}

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

/**
 * 環境投影數據介面 (Context Projection)
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
  nodes: TaskDTO[];
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
  nodes: TaskDTO[];
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
