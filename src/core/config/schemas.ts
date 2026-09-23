import { z } from 'zod';

/**
 * 儲存與檔案路徑配置規格架構 (StorageSectionSchema)
 * 統一管理全系統各子模組的持久化磁碟路徑與檔案名稱
 */
export const StorageSectionSchema = z.object({
    /** 儲存基礎根目錄 (例如 './data/sessions') */
    base_dir: z.string().default('./workspace').describe('Base directory for storage'),
    /** 會話子目錄或前綴 */
    session_dir: z.string().default('sessions').describe('Subdirectory or prefix for session entities'),
    /** Agent 專屬工作區與歷史子目錄名稱 */
    agent_dir: z.string().default('agents').describe('Subdirectory name for agent workspaces and trajectories'),
    /** 大資料 Blob 檔案存儲目錄名稱 */
    blob_dir: z.string().default('blobs').describe('Subdirectory name for offloaded large payload blobs'),
    /** 每日總結 Markdown 存儲目錄名稱 */
    summary_dir: z.string().default('summaries').describe('Subdirectory name for episodic daily summaries'),
    /** 歷史記錄檔名 */
    history_file: z.string().default('history.jsonl').describe('Filename for agent trajectory jsonl log'),
    /** Agent Profile 設定檔目錄名稱 */
    profile_dir: z.string().default('profiles').describe('Subdirectory name for agent profile configurations'),
    /** 預設 Profile 版本目錄 */
    profile_version: z.string().default('v1').describe('Default version folder for agent profiles'),
    /** 知識圖譜資料子目錄名稱 */
    graph_dir: z.string().default('graph').describe('Subdirectory name for knowledge graph storage'),
    /** 知識圖譜實體節點檔名 */
    graph_nodes_file: z.string().default('nodes.json').describe('Filename for graph nodes'),
    /** 知識圖譜實體關聯邊檔名 */
    graph_edges_file: z.string().default('edges.json').describe('Filename for graph edges'),
});


export type StorageConfig = z.infer<typeof StorageSectionSchema>;

export const DEFAULT_STORAGE_CONFIG: StorageConfig = StorageSectionSchema.parse({});

/**
 * 代理人行為與認知控制配置規格架構 (AgentSectionSchema)
 * 統一管理歷史窗口大小、省 Token 壓縮、時間感知插針、大資料卸載門檻與排程喚醒
 */
export const AgentSectionSchema = z.object({
    /* ===== 1. 上下文窗口與滑動壓縮 (Context Window & Compaction) ===== */
    /** 最大上下文歷史訊息窗口 (超出時滑動裁切) */
    max_context_window: z.number().default(50).describe('Maximum historical message window size in memory'),
    /** 保留末端不壓縮的完整排版訊息筆數 */
    uncompressed_tail: z.number().default(4).describe('Number of recent messages to keep uncompressed'),
    /** 是否對較早歷史啟用緊湊省 Token 壓縮 */
    save_tokens: z.boolean().default(true).describe('Enable compact token-saving formatting for older history'),
    /** 讀取磁碟歷史檔案時的安全筆數上限 (防止巨型檔案癱瘓記憶體) */
    max_history_lines_safety_cap: z.number().default(500).describe('Safety cap for maximum history lines to read from disk'),

    /* ===== 2. 大資料卸載與 OOM 防禦 (Payload Offloading & Blob Storage) ===== */
    /** 是否開啟超大文本自動卸載 (DataPointer) 功能 */
    enable_payload_offload: z.boolean().default(true).describe('Enable automatic offloading of large payloads to blob storage'),
    /** 收到即時新訊息時觸發卸載為 Blob 檔案的長度門檻 (字元數) */
    offload_threshold_new_message: z.number().default(30000).describe('Threshold in characters for new incoming messages to offload to blob'),
    /** 較早歷史滑動壓縮時的嚴格卸載長度門檻 (字元數) */
    offload_threshold_compact: z.number().default(1000).describe('Strict threshold in characters for older compacted history to offload to blob'),
    /** 大資料 Blob 指標預覽字串長度 */
    preview_length: z.number().default(100).describe('Character length of preview text in DataPointer markers'),

    /* ===== 3. 時間感知插針 (Temporal Awareness) ===== */
    /** 是否開啟對話時間感知插針 */
    enable_temporal_injection: z.boolean().default(true).describe('Inject temporal gap markers between long dialogue pauses'),
    /** 觸發時間感知插針的時間間隔閾值 (毫秒，預設 30 分鐘) */
    temporal_threshold_ms: z.number().default(1800000).describe('Time threshold in milliseconds to trigger temporal marker (default 5 min)'),

    /* ===== 4. 訊息路由與喚醒調度 (Routing & Wakeup Scheduling) ===== */
    /** 允許暫時忽略背景通知累積多少筆時強制喚醒 Agent */
    force_wakeup_threshold: z.number().default(5).describe('Queue count threshold to wake up agent on low-priority messages'),

    /* ===== 5. 記憶檢索與情節總結 (Memory & Episodic Summaries) ===== */
    /** 注入近期每日總結的天數 (預設 3 天) */
    memory_episodic_days: z.number().default(3).describe('Number of recent days to retrieve for episodic memory summaries'),
});

export type AgentConfig = z.infer<typeof AgentSectionSchema>;

export const DEFAULT_AGENT_CONFIG: AgentConfig = AgentSectionSchema.parse({});
