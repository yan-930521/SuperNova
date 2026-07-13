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
}

/**
 * 儲存配置子介面
 */
export interface StorageConfig {
  /** 儲存根目錄 (workspace) */
  readonly base_dir: string;
  /** 會話子目錄 */
  readonly sessions_dir: string;
  /** 記憶體根目錄 */
  readonly memory_dir: string;
  /** Agent 專屬實體工作區子目錄 */
  readonly agent_dir: string;
}

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
