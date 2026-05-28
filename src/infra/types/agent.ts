import { MessageDTO } from './session';

/**
 * 模型用途預設
 */
export enum ModelPreset {
  /** 快速生成，適用於簡單的思維分支 */
  FAST = 'fast',
  /** 高智能，適用於複雜規劃與拆解 */
  SMART = 'smart',
  /** 嚴謹，專門用於評價與審核 */
  EVAL = 'eval'
}

/**
 * 代理數據傳輸對象 (Agent Data Transfer Object)
 * 定義代理的靜態屬性、角色、能力以及與 LLM 對接的配置。
 */
export interface AgentDTO {
  /** 代理唯一識別碼 (例如 'researcher-01', 'coder-01') */
  id: string;
  /** 代理的角色名稱，用於任務指派邏輯 */
  role: string;
  /** 代理的身份提示詞 (System Prompt Fragment)，定義其性格與專業領域 */
  identity: string;
  /** 代理具備的能力標籤清單，對齊工具調用權限 */
  capabilities: string[];
  /** 代理可使用的具體工具 ID 列表 */
  tools?: string[];
  /** 偏好的模型預設 */
  modelPreset: ModelPreset;
  /** 額外的運行時配置，如 temperature, max_tokens 等 */
  config: Record<string, any>;
}

/**
 * 代理儲存庫接口
 * 負責 Agent 配置的載入與持久化。
 */
export interface IAgentRepository {
  /**
   * 根據 ID 查找代理配置
   * @param id 代理識別碼
   */
  findById(id: string): Promise<AgentDTO | null>;

  /**
   * 獲取系統中所有已註冊的代理配置
   */
  findAll(): Promise<AgentDTO[]>;

  /**
   * 保存或更新代理配置
   * @param agent 代理數據對象
   */
  save(agent: AgentDTO): Promise<void>;
}

/**
 * Agent 執行上下文介面 (Execution Context)
 * 傳遞給 Agent 的運行時環境資訊。
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
  /** 當前任務的重試次數 */
  retryCount?: number;
  /** 上一次執行的錯誤訊息 */
  lastError?: string;
  /** 前置任務的執行結果摘要 (TaskID -> Summary) */
  dependencyResults?: Record<string, string>;
  /** 額外的元數據 */
  metadata?: Record<string, any>;
}

/**
 * Agent 執行結果介面 (Execution Result)
 */
export interface IAgentExecuteResult {
  /** 執行狀態 */
  status: 'success' | 'failed';
  /** 具體產出的數據 */
  result: {
    content: string;
    history: MessageDTO[];
  };
  /** 供會話歷史使用的摘要內容 (對話式輸出) */
  summary: string;
  /** 錯誤訊息 (僅在失敗時) */
  error?: string;
  /** 建議的下一步行動 */
  next_steps?: string;
}
