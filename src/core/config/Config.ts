import { z } from 'zod';

import type { ChatOpenAICallOptions, OpenAIChatInput } from '@langchain/openai';

export const CacheConfigSchema = z.object({
    history_lru_size: z.number().describe('歷史訊息 LRU 快取最大數量'),
    prompt_lru_size: z.number().describe('系統提示詞 LRU 快取最大數量'),
    prompt_ttl_ms: z.number().describe('系統提示詞快取有效時間 (毫秒)'),
    projection_lru_size: z.number().describe('意識投影歷史 LRU 快取最大數量'),
    projection_ttl_ms: z.number().describe('意識投影歷史快取有效時間 (毫秒)'),
    event_bus_lru_size: z.number().describe('EventBus 監聽者快取最大數量'),
});

export const AgentConfigSchema = z.object({
    profile_version: z.string().describe('Agent Profile 的版本資料夾名稱，例如 "v1"'),
    max_clones_per_agent: z.number().describe('允許派生分身的數量上限 (避免記憶體與 Token 無限耗盡)'),
    force_wakeup_threshold: z.number().describe('允許agent暫時忽略的背景資訊通知'),
    save_tokens: z.boolean().describe('context engineering 時 節省token'),
    uncompressed_tail: z.number().describe('保留最近 n 筆不壓縮，避免 LLM 忘記剛執行的細節，僅在 save_tokens = true 時啟用'),
    max_context_window: z.number().describe('最大上下文窗口'),
    enable_temporal_injection: z.boolean().describe('是否開啟對話時間感知插針'),
    enable_graph_memory: z.boolean().describe('是否開啟記憶圖譜背景萃取功能'),
    enable_daily_summary: z.boolean().describe('是否開啟每日總結功能'),
    enable_payload_offload: z.boolean().describe('是否開啟超大文本自動卸載 (Data Pointer) 功能'),
    temporal_threshold_ms: z.number().describe('觸發時間感知插針的時間間隔閾值 (毫秒)'),
    offload_threshold_new_message: z.number().describe('收到新訊息時，超過此長度 (字元) 的 Payload 將自動卸載'),
    offload_threshold_compact: z.number().describe('背景歷史壓縮時，超過此長度 (字元) 的舊歷史 Payload 將被強制卸載'),
    max_history_lines_safety_cap: z.number().describe('讀取檔案時的安全上限，防止單一檔案過大癱瘓記憶體'),
    memory_extract_threshold: z.number().describe('對話累積多少筆未萃取記憶時，觸發背景萃取'),
    daily_optimization_time: z.string().describe('每日優化觸發時間 (HH:mm)，例如 "03:00"'),
    daily_optimization_check_interval_ms: z.number().describe('換日偵測的心跳檢查間隔 (毫秒)，預設 30000 (30秒)'),
    daily_optimization_idle_threshold_ms: z.number().describe('換日後防打斷的靜默等待時間 (毫秒)，預設 600000 (10分鐘)'),
    memory_episodic_days: z.number().describe('注入近期每日總結的天數 (預設 3)'),
    memory_graph_topk: z.number().describe('圖譜記憶向量搜尋的 TopK 數量 (預設 5)'),
    memory_graph_depth: z.number().describe('圖譜記憶搜尋的向外擴展深度 (預設 2)'),
});

export const LLMConfigSchema = z.object({
    default_preset: z.string().describe('預設使用的 preset 名稱'),
    embedding_model: z.string().describe('生成向量(Embeddings)時使用的模型名稱'),
    presets: z.record(z.string(), z.any()).describe('自定義的多組設定檔 (如 SMART, FAST 等)')
});

export const StorageConfigSchema = z.object({
    base_dir: z.string().describe('儲存根目錄 (workspace)'),
    session_dir: z.string().describe('會話子目錄'),
    agent_dir: z.string().describe('Agent 專屬實體工作區子目錄'),
    agent_profile_dir: z.string().describe('Profile目錄'),
    graph_dir: z.string().describe('圖譜資料庫子目錄'),
    daily_dir: z.string().describe('每日總結存放目錄'),
    blob_dir: z.string().describe('Blob目錄'),
    session_file: z.string(),
    agent_state_file: z.string(),
    history_file: z.string(),
    oplog_file: z.string(),
    graph_nodes_file: z.string(),
    graph_edges_file: z.string(),
});

export const SecurityConfigSchema = z.object({
    default_tool_timeout_ms: z.number().describe('工具執行的預設超時時間 (ms)'),
    allow_tier_3_tools: z.boolean().describe('是否允許執行 TIER_3 (高風險/外部) 工具'),
    max_safe_tokens: z.number().describe('安全 token 上限預警值'),
});

export const ConfigSchema = z.object({
    version: z.string().describe('系統版本號碼'),
    security: SecurityConfigSchema.describe('安全性相關配置'),
    storage: StorageConfigSchema.describe('儲存路徑相關配置'),
    llm: LLMConfigSchema.describe('大語言模型相關配置'),
    agent: AgentConfigSchema.describe('Agent 行為配置'),
    cache: CacheConfigSchema.describe('快取與 TTL 相關配置'),
}).describe('系統全局配置');

export type CacheConfig = Readonly<z.infer<typeof CacheConfigSchema>>;
export type AgentConfig = Readonly<z.infer<typeof AgentConfigSchema>>;
export type ModelPreset = Partial<OpenAIChatInput & ChatOpenAICallOptions>;
export type LLMConfig = Readonly<Omit<z.infer<typeof LLMConfigSchema>, 'presets'> & { presets: Record<string, ModelPreset> }>;
export type StorageConfig = Readonly<z.infer<typeof StorageConfigSchema>>;
export type SecurityConfig = Readonly<z.infer<typeof SecurityConfigSchema>>;
export type Config = Readonly<Omit<z.infer<typeof ConfigSchema>, 'llm'> & { llm: LLMConfig }>;

export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};
