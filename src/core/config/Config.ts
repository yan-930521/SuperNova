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
    /** Agent 行為配置 */
    readonly agent: AgentConfig;
    /** 快取與 TTL 相關配置 */
    readonly cache: CacheConfig;
}

/**
 * 快取配置子介面
 */
export interface CacheConfig {
    /** 歷史訊息 LRU 快取最大數量 */
    readonly history_lru_size: number;
    /** 系統提示詞 LRU 快取最大數量 */
    readonly prompt_lru_size: number;
    /** 系統提示詞快取有效時間 (毫秒) */
    readonly prompt_ttl_ms: number;
    /** 意識投影歷史 LRU 快取最大數量 */
    readonly projection_lru_size: number;
    /** 意識投影歷史快取有效時間 (毫秒) */
    readonly projection_ttl_ms: number;
    /** EventBus 監聽者快取最大數量 */
    readonly event_bus_lru_size: number;
}

/**
 * Agent 行為配置子介面
 */
export interface AgentConfig {
    /** 允許派生分身的數量上限 (避免記憶體與 Token 無限耗盡) */
    readonly max_clones_per_agent: number;

    /** 允許agent暫時忽略的背景資訊通知 */
    readonly force_wakeup_threshold: number;

    /** context engineering 時 節省token */
    readonly save_tokens: boolean;

    /** 保留最近 n 筆不壓縮，避免 LLM 忘記剛執行的細節，僅在 save_tokens = true 時啟用 */
    readonly uncompressed_tail: number;

    /** 最大上下文窗口 */
    readonly max_context_window: number;

    /** 是否開啟對話時間感知插針 */
    readonly enable_temporal_injection: boolean;

    /** 觸發時間感知插針的時間間隔閾值 (毫秒) */
    readonly temporal_threshold_ms: number;

    /** 收到新訊息時，超過此長度 (字元) 的 Payload 將自動卸載 */
    readonly offload_threshold_new_message: number;

    /** 背景歷史壓縮時，超過此長度 (字元) 的舊歷史 Payload 將被強制卸載 */
    readonly offload_threshold_compact: number;

    /** 讀取檔案時的安全上限，防止單一檔案過大癱瘓記憶體 */
    readonly max_history_lines_safety_cap: number;
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
