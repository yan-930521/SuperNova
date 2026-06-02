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
 * 代理類型 Enum
 */
export enum AgentType {
  WORKER = 'WORKER',
  MAIN_AGENT = 'MAIN_AGENT'
}

/**
 * 代理數據傳輸對象 (Agent DTO)
 * 定義代理的靜態屬性、角色、能力以及與 LLM 對接的配置。
 */
export interface AgentDTO {
  /** 代理唯一識別碼 (例如 'researcher-01', 'coder-01') */
  id: string;
  /** 代理類型 (Worker/MainAgent) */
  type: AgentType;
  /** 代理的角色名稱，用於任務指派邏輯 */
  role: string;
  /** 代理的身份提示詞 (System Prompt Fragment) */
  identity: string;
  /** 代理具備的能力標籤清單 */
  capabilities: string[];
  /** 代理可使用的具體工具 ID 列表 */
  tools: string[];
  /** 偏好的模型預設 */
  modelPreset: ModelPreset;
  /** 可調用的代理白名單 */
  availableAgents: string[];
  /** 額外的運行時配置 */
  config: Record<string, unknown>;
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