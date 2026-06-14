import { MessageDTO } from './session';

/**
 * 任務執行狀態 Type
 */
export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'archived';

/**
 * 任務鏈/流程狀態 Type
 */
export type ChainStatus = 'planning' | 'running' | 'completed' | 'failed' | 'stuck';

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
  traceId: string;
  /** 任務類型，如 'work', 'research', 'code' 等 */
  type: string;
  /** 任務具體要達成的目標 */
  goal: string;
  /** 驗證成功的標準 */
  successCriteria?: string;
  /** 各階段產出的摘要，用於組裝後續任務的 Context */
  phaseSummary?: Record<string, string>;
  /** 最終組裝好的上下文內容 */
  context?: string;
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
  /** 任務流轉狀態機數據 */
  flow: TaskFlowDTO;
  /** 子任務圖 (分形架構支援) */
  subGraph?: TaskGraphData;
}

/**
 * 任務流轉數據傳輸對象 (TaskFlow DTO)
 */
export interface TaskFlowDTO {
  /** 模板類型：Instant, Simple, Standard, Complex, Exploratory, Emergency, Recursive */
  templateType: string;
  /** 當前階段 (e.g., 'PLANNING', 'DOING', 'CHECKING') */
  currentPhase: string;
  /** 流程階段序列 (有序) */
  phases: string[];
  /** 狀態機變遷歷史 */
  history: Array<{
    phase: string;
    timestamp: number;
    result: string;
  }>;
  /** 換檔標記 (是否已被 SA 升級/調整) */
  isEscalated: boolean;
}

/**
 * 任務請求介面 (用於 TaskManager Inbox)
 */
export interface ITaskRequest {
  goal: string;
  description: string;
  sessionId: string;
  traceId: string;
  requesterId: string;
}

/**
 * 任務鏈狀態摘要
 */
export interface IChainStatusSummary {
  traceId: string;
  status: ChainStatus;
  nodes: TaskDTO[];
  sessionId?: string;
  goal?: string;
  planningDocument?: string;
}

/**
 * 任務圖資料結構 (TaskGraphData)
 */
export interface TaskGraphData {
  nodes: TaskDTO[];
  phases: string[];
  currentPhaseIndex: number;
}