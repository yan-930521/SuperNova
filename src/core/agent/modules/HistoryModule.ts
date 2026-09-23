import {
    AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
} from '@langchain/core/messages';
import { IPromptSection, PromptSectionIndex } from '@supernova/events/IBus';

import { AgentConfig, DEFAULT_AGENT_CONFIG } from '../../config';
import { DataBlock, FileSystemDataBlockRepository } from '../../messaging';
import { IAgentContext, IAgentModule, RunContext } from '../types';

/**
 * 歷史對話管理模組配置選項
 */
export interface HistoryModuleOptions {
    /** 代理人配置規格 */
    agent?: AgentConfig;
    /** 是否開啟大資料自動卸載為 Blob (可覆寫 agent.enable_payload_offload) */
    enablePayloadOffload?: boolean;
    /** 允許保存的最大歷史訊息條數 (可覆寫 agent.max_context_window) */
    maxMessages?: number;
    /** 可選的歷史總結或背景認知 System Prompt 注入 */
    summaryPrompt?: string;
    /** 是否啟用時間感知插針 (可覆寫 agent.enable_temporal_injection) */
    enableTemporalInjection?: boolean;
    /** 觸發時間插針的毫秒數門檻 (可覆寫 agent.temporal_threshold_ms) */
    temporalThresholdMs?: number;
    /** 是否對較早歷史啟用省 Token 壓縮 (可覆寫 agent.save_tokens) */
    saveTokens?: boolean;
    /** 保留完整排版不壓縮的最新訊息則數 (可覆寫 agent.uncompressed_tail) */
    uncompressedTail?: number;
    /** 初始歷史訊息列表 */
    initialMessages?: (BaseMessage | DataBlock)[];
    /** 可選注入 DataBlock 全量歷史儲存庫 (實現 JSONL 全量追加落盤) */
    repository?: FileSystemDataBlockRepository;
    /** 所屬會話 ID (若未從 AgentContext 獲取時備用) */
    sessionId?: string;
}

/**
 * 內部歷史條目封裝
 */
interface HistoryEntry {
    /** 原始 DataBlock (若有，可提供豐富元資料、時間戳與精確壓縮能力) */
    block?: DataBlock;
    /** 轉譯後的 LangChain BaseMessage 實例 */
    message: BaseMessage;
    /** 建立時間戳 */
    timestamp: number;
}

/**
 * 增量歷史快取結構
 */
interface HistoryCache {
    entryCount: number;
    messages: BaseMessage[];
}

/**
 * 對話歷史管理器官模組 (HistoryModule)
 * 核心能力：
 * 1. 雙層架構：結合 FileSystemDataBlockRepository 實現「JSONL 全量軌跡永久追加」+「記憶體滑動窗口」
 * 2. 時間感知插針 (injectTemporalMarker)：相隔超過閾值自動注入時間提示，賦予模型時間流逝感
 * 3. 滑動省 Token 壓縮 (saveTokens + uncompressedTail)：較早訊息緊湊壓縮，末端訊息保留全量排版
 * 4. 增量快取加速 (Incremental Cache)：避免每次決策重複全量編譯對話歷程
 * 5. 支援器官狀態快照 serialize() 與 hydrate()，支援重啟無損還原
 */
export class HistoryModule implements IAgentModule {
    /** 模組識別名稱 */
    public readonly name: string = 'history';

    /** 執行優先級：設為 10，確保在所有決策與規劃器官之前優先裝配對話上下文 */
    public readonly priority: number = 10;

    /** 代理人配置規格 */
    private readonly agentConfig?: AgentConfig;
    /** 是否開啟大資料自動卸載為 Blob */
    private readonly enablePayloadOffload: boolean;

    private readonly maxMessages: number;
    private readonly enableTemporalInjection: boolean;
    private readonly temporalThresholdMs: number;
    private readonly saveTokens: boolean;
    private readonly uncompressedTail: number;
    private summaryPrompt?: string;

    /** 可選注入的 JSONL 軌跡持久化儲存庫 */
    public readonly repository?: FileSystemDataBlockRepository;
    public sessionId?: string;

    /** 歷史條目清單 (按時間戳排序) */
    private entries: HistoryEntry[] = [];

    /** 增量編譯快取 */
    private historyCache: HistoryCache | null = null;

    private context?: IAgentContext;

    constructor(options: HistoryModuleOptions = {}) {
        this.agentConfig = options.agent;
        this.enablePayloadOffload =
            options.enablePayloadOffload ??
            options.agent?.enable_payload_offload ??
            DEFAULT_AGENT_CONFIG.enable_payload_offload;

        this.maxMessages = Math.max(
            1,
            options.maxMessages ??
                options.agent?.max_context_window ??
                DEFAULT_AGENT_CONFIG.max_context_window
        );
        this.enableTemporalInjection =
            options.enableTemporalInjection ??
            options.agent?.enable_temporal_injection ??
            DEFAULT_AGENT_CONFIG.enable_temporal_injection;
        this.temporalThresholdMs =
            options.temporalThresholdMs ??
            options.agent?.temporal_threshold_ms ??
            DEFAULT_AGENT_CONFIG.temporal_threshold_ms;
        this.saveTokens =
            options.saveTokens ??
            options.agent?.save_tokens ??
            DEFAULT_AGENT_CONFIG.save_tokens;
        this.uncompressedTail = Math.max(
            0,
            options.uncompressedTail ??
                options.agent?.uncompressed_tail ??
                DEFAULT_AGENT_CONFIG.uncompressed_tail
        );
        this.summaryPrompt = options.summaryPrompt;
        this.repository = options.repository;
        this.sessionId = options.sessionId;

        if (options.initialMessages && options.initialMessages.length > 0) {
            this.append(options.initialMessages);
        }
    }

    /**
     * 當模組掛載至 Agent 時注入 Agent 上下文，若有注入 repository 則自動還原全量歷史
     * @param context 代理上下文
     */
    public async onAttach(context: IAgentContext): Promise<void> {
        this.context = context;
        this.invalidateCache();

        // 若有全量儲存庫，自動讀盤還原該 Agent 的歷史軌跡
        if (this.repository) {
            const sessionId = this.sessionId || 'default';
            const agentId = context.agentId;
            const historicalBlocks = await this.repository.findByAgent(sessionId, agentId);

            if (historicalBlocks.length > 0) {
                for (const block of historicalBlocks) {
                    this.appendBlock(block);
                }
                this.trimHistory();
            }
        }
    }

    /**
     * 當模組卸載時清理狀態
     */
    public onDetach(): void {
        this.context = undefined;
        this.invalidateCache();
    }

    /** 待寫入磁碟的新訊息暫存區 (包含使用者輸入) */
    private pendingPersistBlocks: DataBlock[] = [];

    /**
     * 執行週期前置鉤子：將歷史訊息與當前輸入訊息合流，注入 RunContext.messages
     * @param context 當前執行週期上下文
     */
    public onBeforeRun(context: RunContext): void {
        // 若 context 中已有傳入的新訊息，先加入內部歷史進行追蹤，並轉換為 DataBlock 準備落盤
        if (context.messages && context.messages.length > 0) {
            for (const msg of context.messages) {
                const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                const alreadyExists = this.entries.some(
                    (e) => e.message === msg || (e.block && e.block.controlPayload === msgContent)
                );

                if (!alreadyExists) {
                    const blockRole = msg._getType() === 'human' ? 'human' : 'system';
                    const inputBlock = new DataBlock({
                        sessionId: this.sessionId || 'default',
                        senderId: msg._getType() === 'human' ? 'user' : 'system',
                        type: blockRole,
                        intent: 'USER_INPUT',
                        controlPayload: msgContent,
                    });

                    this.appendBlock(inputBlock);
                    this.pendingPersistBlocks.push(inputBlock);
                }
            }
        }

        // 應用滑動窗口裁剪
        this.trimHistory();

        // 編譯帶有時間感知插針與省 Token 壓縮的完整歷史訊息清單
        const compiledMessages = this.buildHistoryMessagesIncremental();

        // 賦予 context.messages 供模型推論
        context.messages = [...compiledMessages];
    }

    /**
     * 執行週期後置鉤子：捕獲本次對話產生的 DataBlock 固化至記憶體與磁碟 JSONL
     * @param context 當前執行週期上下文
     */
    public async onAfterRun(context: RunContext): Promise<void> {
        const newlyAddedBlocks: DataBlock[] = [];

        // 若在 context.metadata 中有本次決策產出的完整 newBlocks (包含 Tool 與 AI 區塊)，優先加入
        if (Array.isArray(context.metadata.newBlocks) && context.metadata.newBlocks.length > 0) {
            for (const block of context.metadata.newBlocks) {
                if (block instanceof DataBlock) {
                    this.appendBlock(block);
                    newlyAddedBlocks.push(block);
                }
            }
        } else if (context.modelResponse) {
            // 否則若僅有單一 AIMessage，封裝為 DataBlock 記錄
            const outputBlock = new DataBlock({
                sessionId: this.sessionId || 'default',
                senderId: this.context?.agentId || 'agent',
                type: 'ai',
                intent: 'AGENT_REPLY',
                controlPayload:
                    typeof context.modelResponse.content === 'string'
                        ? context.modelResponse.content
                        : JSON.stringify(context.modelResponse.content),
            });
            this.appendBlock(outputBlock);
            newlyAddedBlocks.push(outputBlock);
        }

        // 若配置了全量儲存庫，將本次對話的所有新區塊 (使用者輸入 + 模型輸出 + 工具結果) 全量追加至磁碟 JSONL
        const blocksToPersist = [...this.pendingPersistBlocks, ...newlyAddedBlocks];
        if (this.repository && blocksToPersist.length > 0) {
            const sessionId = this.sessionId || 'default';
            const agentId = this.context?.agentId || 'agent';
            // 自動並行檢查與卸載即時新訊息過大酬載 (OOM 防禦)，採用 'new_message' 門檻
            const processedBlocks = this.enablePayloadOffload
                ? await Promise.all(
                    blocksToPersist.map((b) =>
                        this.repository!.offloadLargePayloads(sessionId, b, 'new_message')
                    )
                )
                : blocksToPersist;
            await this.repository.appendForAgent(sessionId, agentId, processedBlocks);
        }
        this.pendingPersistBlocks = [];

        // 對退居 uncompressedTail 之前的較早歷史區塊，進行背景深層壓縮卸載 (採用 'compact' 嚴格門檻)
        if (this.repository && this.enablePayloadOffload) {
            const sessionId = this.sessionId || 'default';
            const olderBoundary = Math.max(0, this.entries.length - this.uncompressedTail);
            for (let i = 0; i < olderBoundary; i++) {
                const entry = this.entries[i];
                if (entry.block && !entry.block.isCompacted) {
                    entry.block = await this.repository.offloadLargePayloads(
                        sessionId,
                        entry.block,
                        'compact'
                    );
                    this.invalidateCache();
                }
            }
        }

        // 保持歷史記憶體窗口不超過上限
        this.trimHistory();
    }

    /**
     * 提供動態 Prompt 段落 (若有設定 summaryPrompt 則注入至 MEMORY_CONTEXT)
     */
    public getPromptSections(): IPromptSection[] {
        const sections: IPromptSection[] = [];
        if (this.summaryPrompt && this.summaryPrompt.trim().length > 0) {
            sections.push({
                index: PromptSectionIndex.MEMORY_CONTEXT,
                content: this.summaryPrompt,
            });
        }
        return sections;
    }

    /**
     * 追加單一或批次訊息至歷史中
     * 支援 BaseMessage 與 DataBlock
     * @param item 欲追加的訊息或 DataBlock
     */
    public append(item: BaseMessage | DataBlock | (BaseMessage | DataBlock)[]): void {
        const items = Array.isArray(item) ? item : [item];

        for (const entry of items) {
            if (entry instanceof DataBlock) {
                this.appendBlock(entry);
            } else if (entry instanceof BaseMessage) {
                this.entries.push({
                    message: entry,
                    timestamp: Date.now(),
                });
                this.invalidateCache();
            }
        }

        this.trimHistory();
    }

    /**
     * 追加單一 DataBlock 並轉譯為 Entry
     */
    private appendBlock(block: DataBlock): void {
        const alreadyExists = this.entries.some((e) => e.block?.id === block.id);
        if (alreadyExists) {
            return;
        }

        const readerId = this.context?.agentId;
        const message = block.toMessage(readerId, false);
        this.entries.push({
            block,
            message,
            timestamp: block.timestamp,
        });
        this.invalidateCache();
    }

    /**
     * 取得當前所有對話歷史副本 (直接回傳由最新狀態編譯的 BaseMessage 陣列)
     */
    public getMessages(): BaseMessage[] {
        return this.buildHistoryMessagesIncremental();
    }

    /**
     * 重設/覆蓋對話歷史
     * @param messages 新的歷史訊息清單
     */
    public setMessages(messages: BaseMessage[]): void {
        const now = Date.now();
        this.entries = messages.map((m, index) => ({
            message: m,
            timestamp: now + index,
        }));
        this.invalidateCache();
        this.trimHistory();
    }

    /**
     * 清空所有對話歷史
     */
    public clear(): void {
        this.entries = [];
        this.invalidateCache();
    }

    /**
     * 更新歷史背景或摘要 Prompt
     * @param prompt 摘要內容
     */
    public setSummaryPrompt(prompt?: string): void {
        this.summaryPrompt = prompt;
    }

    /**
     * 取得當前儲存的歷史條目總數
     */
    public get size(): number {
        return this.entries.length;
    }

    // ─── 序列化與反序列化快照 (Serialization & Hydration) ───

    /**
     * 將模組內部狀態序列化為純物件
     */
    public serialize(): Record<string, any> {
        return {
            maxMessages: this.maxMessages,
            summaryPrompt: this.summaryPrompt,
            entries: this.entries.map((e) => ({
                timestamp: e.timestamp,
                block: e.block ? e.block.toJSON() : undefined,
                messageContent: e.message.content,
                messageType: e.message._getType(),
            })),
        };
    }

    /**
     * 從序列化資料還原模組狀態
     */
    public hydrate(data: Record<string, any>): void {
        if (!data) return;

        if (typeof data.summaryPrompt === 'string') {
            this.summaryPrompt = data.summaryPrompt;
        }

        if (Array.isArray(data.entries)) {
            this.entries = [];
            for (const item of data.entries) {
                if (item.block) {
                    const block = DataBlock.fromJSON(item.block);
                    this.appendBlock(block);
                } else if (item.messageContent) {
                    let msg: BaseMessage;
                    if (item.messageType === 'human') {
                        msg = new HumanMessage(item.messageContent);
                    } else if (item.messageType === 'ai') {
                        msg = new AIMessage(item.messageContent);
                    } else {
                        msg = new SystemMessage(item.messageContent);
                    }
                    this.entries.push({ message: msg, timestamp: item.timestamp ?? Date.now() });
                }
            }
            this.trimHistory();
            this.invalidateCache();
        }
    }

    // ─── 核心增量編譯、時間感知與壓縮機制 ───

    /**
     * 動態時間感知插針：在時間差超過門檻的訊息之間注入系統時間標記
     */
    protected injectTemporalMarker(
        prevTimestamp: number,
        currTimestamp: number,
        outputArray: BaseMessage[]
    ): void {
        if (!this.enableTemporalInjection) return;

        const timeDiff = currTimestamp - prevTimestamp;
        if (timeDiff > this.temporalThresholdMs) {
            const minutes = Math.floor(timeDiff / 60_000);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            let timeStr = '';
            if (days > 0) timeStr = `${days} 天 ${hours % 24} 小時`;
            else if (hours > 0) timeStr = `${hours} 小時 ${minutes % 60} 分鐘`;
            else timeStr = `${minutes} 分鐘`;

            outputArray.push(new SystemMessage(`[系統提示：距離上一次對話已過 ${timeStr}]`));
        }
    }

    /**
     * 增量編譯歷史訊息清單 (整合增量快取、時間插針與滑動省 Token 壓縮)
     */
    public buildHistoryMessagesIncremental(): BaseMessage[] {
        const total = this.entries.length;
        if (total === 0) {
            return [];
        }

        const readerId = this.context?.agentId;
        const shouldCompress = (index: number) => {
            return this.saveTokens && index < total - this.uncompressedTail;
        };

        // 檢查快取是否有效 (若末端 entries 數量與快取一致則直接返回快取)
        if (this.historyCache && this.historyCache.entryCount === total) {
            return [...this.historyCache.messages];
        }

        // 全量或尾端重編譯
        const result: BaseMessage[] = [];

        for (let i = 0; i < total; i++) {
            const entry = this.entries[i];

            // 檢查相鄰訊息之間的時間差，若超標則動態插入時間感知插針
            if (i > 0) {
                const prevEntry = this.entries[i - 1];
                this.injectTemporalMarker(prevEntry.timestamp, entry.timestamp, result);
            }

            // 若有 DataBlock，根據壓縮策略動態產生 BaseMessage
            if (entry.block) {
                const isCompressed = shouldCompress(i);
                result.push(entry.block.toMessage(readerId, isCompressed));
            } else {
                result.push(entry.message);
            }
        }

        // 更新快取
        this.historyCache = {
            entryCount: total,
            messages: result,
        };

        return [...result];
    }

    /**
     * 清理快取
     */
    private invalidateCache(): void {
        this.historyCache = null;
    }

    /**
     * 滑動窗口截斷邏輯：超出 maxMessages 時自動淘汰最舊的記錄
     */
    private trimHistory(): void {
        if (this.entries.length > this.maxMessages) {
            const overflow = this.entries.length - this.maxMessages;
            this.entries.splice(0, overflow);
            this.invalidateCache();
        }
    }
}
