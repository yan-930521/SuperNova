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
 * 代理角色類型 (Agent Roles) - v0.4.0 標準
 * 定義 PDCA 循環中的專業分工。
 */
export enum AgentType {
  /** 推理編排器 / 指揮官 */
  SUPERVISOR = 'SUPERVISOR',
  /** 規劃專家 / 分形架構師 */
  PLANNING = 'PLANNING',
  /** 執行專家 / 核心工程師 */
  DOING = 'DOING',
  /** 質量門禁 / QA 審核者 */
  CHECKING = 'CHECKING',
  /** 標準化與改善者 / 知識管理員 */
  ACTING = 'ACTING'
}

/**
 * 代理數據傳輸對象 (Agent DTO)
 * 定義代理的靜態屬性、角色、能力以及與 LLM 對接的配置。
 */
export interface AgentDTO {
  /** 代理唯一識別碼 (例如 'supervisor-01', 'planner-01') */
  id: string;
  /** 代理在 PDCA 循環中的類型 */
  type: AgentType;
  /** 代理的顯示名稱或專業領域描述 */
  role: string;
  /** 代理的身份提示詞 (System Prompt Fragment) */
  identity: string;
  /** 代理具備的能力標籤清單 */
  capabilities: string[];
  /** 代理可使用的具體工具名稱或模式 (例如 ['file.*', 'web_search']) */
  tools: string[];
  /** 偏好的模型預設 */
  modelPreset: ModelPreset;
  /** 可調用的代理 ID 白名單 (用於 Recursive 模式) */
  availableAgents?: string[];
  /** 額外的運行時配置 */
  config: Record<string, unknown>;
}

/**
 * Agent 執行結果介面 (Execution Result)
 * 封裝 Agent 完成任務後的結構化輸出。
 */
export interface IAgentExecuteResult {
  /** 執行狀態 */
  status: 'success' | 'failed' | 'escalated';
  /** 具體產出的數據 */
  result: {
    content: string;
    history: MessageDTO[];
    metadata?: Record<string, any>;
  };
  /** 供會話歷史使用的摘要內容 (對話式輸出) */
  summary: string;
  /** 錯誤訊息 (僅在失敗時) */
  error?: string;
  /** 換檔或重規劃建議 */
  recommendation?: string;
}
