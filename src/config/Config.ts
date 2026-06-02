/**
 * 系統全局配置介面
 * 所有屬性均為 readonly，確保運行時配置不可變。
 */
export interface Config {
  /** 版本號碼 */
  readonly version: string;
  /** 運行時相關配置 */
  readonly runtime: RuntimeConfig;
  /** 可觀測性相關配置 (日誌、追蹤等) */
  readonly observability: ObservabilityConfig;
  /** 安全性相關配置 */
  readonly security: SecurityConfig;
}

/**
 * 運行時配置子介面
 */
export interface RuntimeConfig {
  /** 全局 Tick 頻率 (ms)，控制系統邏輯循環的步進間隔 */
  readonly tick_rate_ms: number;
  /** 系統允許同時存在的最大活動會話數 */
  readonly max_active_sessions: number;
  /** Agent 設定存放目錄 (相對路徑) */
  readonly agents_dir: string;
  /** 預設的保底 Worker Agent ID */
  readonly default_fallback_agent_id: string;
}

/**
 * 可觀測性配置子介面
 */
export interface IObservabilityConfig {
  /** 運行模式：生產、開發或調試 */
  readonly mode: 'PRODUCTION' | 'DEVELOPMENT' | 'DEBUG';
  /** 是否啟用分散式追蹤 (Tracing) */
  readonly enable_tracing: boolean;
  /** 操作日誌 (OpLog) 壓縮閾值，當記錄超過此數量時觸發壓縮 */
  readonly oplog_compression_threshold: number;
}

// 別名以相容舊名稱 (如果需要)
export type ObservabilityConfig = IObservabilityConfig;

/**
 * 安全性配置子介面
 */
export interface SecurityConfig {
  /** 工具執行的預設超時時間 (ms) */
  readonly default_tool_timeout_ms: number;
  /** 是否允許執行 TIER_3 (高風險/外部) 工具 */
  readonly allow_tier_3_tools: boolean;
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
