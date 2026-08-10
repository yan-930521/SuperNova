import { Config } from './Config';

/**
 * 系統預設配置 (Default Configuration)
 * 這是 SuperNova 系統運行的基準配置，所有加載的配置都會基於此物件進行合併覆蓋。
 * 提供合理的預設值確保系統即便在沒有設定檔的情況下也能正常啟動。
 */
export const DEFAULT_CONFIG: Config = {
    version: "v0.2.1",
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
        graph_dir: 'graph',
        daily_dir: 'daily',
        blob_dir: 'blob',
        code_skill_dir: 'codeskills',
        session_file: 'session.json',
        history_file: 'history.jsonl',
        agent_state_file: 'state.json',
        oplog_file: 'oplog.jsonl',
        graph_nodes_file: 'graph_nodes.json',
        graph_edges_file: 'graph_edges.json',
        code_skill_file: 'skill_index.json'
    },
    task: {
        force_mcts: false,
        mcts_max_iterations: 3,
    },
    llm: {
        default_preset: 'REASONING_FAST',
        embedding_model: 'text-embedding-3-small',
        presets: {
            DEFAULT: {
                modelName: 'gpt-5.6-luna',
                temperature: 1,
                maxTokens: 8192,
                reasoning: {
                    effort: 'low',
                    summary: 'auto'
                },
                parallel_tool_calls: true,
                service_tier: 'flex'
            },
            REASONING_FAST: {
                modelName: 'gpt-5.6-luna',
                temperature: 1,
                maxTokens: 8192,
                reasoning: {
                    effort: 'low',
                    summary: 'auto'
                },
                parallel_tool_calls: true,
                service_tier: 'flex'
            },
            FAST: {
                modelName: 'gpt-4o-mini',
                temperature: 0.2,
                maxTokens: 4096,
                parallel_tool_calls: true
            },
            CHEAP: {
                modelName: 'gpt-5.6-luna',
                temperature: 0.2,
                maxTokens: 4096,
                service_tier: 'flex',
                parallel_tool_calls: true
            },
            EXTRACTION: {
                modelName: 'gpt-5.6-luna',
                temperature: 0.1,
                maxTokens: 8192,
                reasoning: {
                    effort: 'none'
                },
                parallel_tool_calls: true,
                service_tier: 'flex'
            }
        }
    },
    agent: {
        profile_version: 'v1',
        max_clones_per_agent: 5,
        force_wakeup_threshold: 5,
        save_tokens: true,
        uncompressed_tail: 5,
        max_context_window: 128000,
        enable_temporal_injection: true,
        enable_graph_memory: true,
        enable_daily_summary: true,
        enable_payload_offload: true,
        temporal_threshold_ms: 1800000,
        offload_threshold_new_message: 50000,
        offload_threshold_compact: 1000,
        max_history_lines_safety_cap: 5000,
        memory_extract_threshold: 10,
        daily_optimization_time: "00:00",
        daily_optimization_check_interval_ms: 30000,
        daily_optimization_idle_threshold_ms: 600000,
        memory_episodic_days: 3,
        memory_graph_topk: 5,
        memory_graph_depth: 2,
        memory_graph_max_nodes: 20,
        memory_graph_max_edges: 30
    },
    cache: {
        history_lru_size: 500,
        prompt_lru_size: 100,
        prompt_ttl_ms: 60000,
        projection_lru_size: 10,
        projection_ttl_ms: 5000,
        event_bus_lru_size: 500,
        code_skill_lru_size: 50
    }
};
