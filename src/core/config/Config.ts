import type { ChatOpenAICallOptions, OpenAIChatInput } from '@langchain/openai';

/**
 * 系統全局配置介面
 * 所有屬性均為 readonly，確保運行時配置不可變。
 */
export interface Config {
  /** 版本號碼 */
  readonly version: string;
  /** 安全性相關配置 */
  readonly security: SecurityConfig;
  /** 儲存路徑相關配置 */
  readonly storage: StorageConfig;
  /** 大語言模型相關配置 */
  readonly llm: LLMConfig;
}

/**
 * LLM 預設選項，直接使用 LangChain 的 OpenAI Input/Call Options
 */
export type ModelPreset = Partial<OpenAIChatInput & ChatOpenAICallOptions>;

/**
 * LLM 配置子介面
 */
export interface LLMConfig {
  /** 預設使用的 preset 名稱 */
  readonly default_preset: string;
  /** 自定義的多組設定檔 (如 SMART, FAST 等) */
  readonly presets: Record<string, ModelPreset>;
}

/**
 * 儲存配置子介面
 */
export interface StorageConfig {
  /** 儲存根目錄 (workspace) */
  readonly base_dir: string;
  /** 會話子目錄 */
  readonly session_dir: string;
  /** Agent 專屬實體工作區子目錄 */
  readonly agent_dir: string;

  readonly agent_profile_dir: string;

  readonly blob_dir: string;

  readonly session_file: string;
  readonly agent_state_file: string;
  readonly history_file: string;
  readonly oplog_file: string;
}

/**
 * 安全性配置子介面
 */
export interface SecurityConfig {
  /** 工具執行的預設超時時間 (ms) */
  readonly default_tool_timeout_ms: number;
  /** 是否允許執行 TIER_3 (高風險/外部) 工具 */
  readonly allow_tier_3_tools: boolean;
  /** 安全 token 上限預警值 */
  readonly max_safe_tokens?: number;
}

/**
 * 局部配置類型，用於加載時的深層合併
 * 允許物件的所有層級屬性變為選擇性 (Optional)
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};
