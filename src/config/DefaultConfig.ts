import { IConfig } from '../../interfaces/config/IConfig';

/**
 * 系統預設配置 (Default Configuration)
 * 這是 SuperNova 系統運行的基準配置，所有加載的配置都會基於此物件進行合併覆蓋。
 * 提供合理的預設值確保系統即便在沒有設定檔的情況下也能正常啟動。
 */
export const DEFAULT_CONFIG: IConfig = {
  runtime: {
    /** 預設 Tick 頻率為 100ms */
    tick_rate_ms: 100,
    /** 預設最大並行會話數為 10 */
    max_active_sessions: 10,
  },
  observability: {
    /** 預設運行於開發模式 */
    mode: 'DEVELOPMENT',
    /** 預設啟用分散式追蹤 */
    enable_tracing: true,
    /** 預設操作日誌壓縮閾值為 100 */
    oplog_compression_threshold: 100,
  },
  security: {
    /** 工具執行超時預設為 30 秒 (30000ms) */
    default_tool_timeout_ms: 30000,
    /** 預設不允許執行 TIER_3 級別的高風險工具 */
    allow_tier_3_tools: false,
  },
};
