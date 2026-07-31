import { Config } from './Config';

/**
 * 系統預設配置 (Default Configuration)
 * 這是 SuperNova 系統運行的基準配置，所有加載的配置都會基於此物件進行合併覆蓋。
 * 提供合理的預設值確保系統即便在沒有設定檔的情況下也能正常啟動。
 */
export const DEFAULT_CONFIG: Config = {
    version: "v0.1.0",
    security: {
        /** 工具執行超時預設為 30 秒 (30000ms) */
        default_tool_timeout_ms: 30000,
        /** 預設不允許執行 TIER_3 級別的高風險工具 */
        allow_tier_3_tools: false,
        /** 預設安全 token 上限預警值 */
        max_safe_tokens: 100000,
    },
    storage: {
        base_dir: './workspace',
        session_dir: 'session',
        agent_dir: 'agent',
        agent_profile_dir: 'profiles',
        blob_dir: "blobs",
        session_file: 'session.json',
        history_file: 'history.jsonl',
        agent_state_file: 'state.json',
        oplog_file: '.oplog.jsonl'
    },
    llm: {
        default_preset: 'SMART',
        presets: {
            SMART: {
                modelName: 'gpt-4o',
                temperature: 0.2,
                maxTokens: 4096,
            },
            FAST: {
                modelName: 'gpt-4o-mini',
                temperature: 0.2,
                maxTokens: 2048,
            },
            CHEAP: {
                modelName: 'gpt-3.5-turbo',
                temperature: 0,
                maxTokens: 1024,
            }
        }
    },
    agent: {
        max_clones_per_agent: 5,
        force_wakeup_threshold: 5,
        save_tokens: true,
        uncompressed_tail: 20,
        max_context_window: 100,
        enable_temporal_injection: true,
        temporal_threshold_ms: 1800000
    }
};
