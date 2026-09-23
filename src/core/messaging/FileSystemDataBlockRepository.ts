import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { IdGenerator } from '@supernova/common';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { BaseJsonlRepository } from '@supernova/storage/base/BaseJsonlRepository';

import {
    AgentConfig, DEFAULT_AGENT_CONFIG, DEFAULT_STORAGE_CONFIG, StorageConfig
} from '../config';
import { DataBlock } from './DataBlock';
import { DataBlockData } from './types';

/**
 * 檔案系統 DataBlock 儲存庫配置選項
 */
export interface FileSystemDataBlockRepositoryOptions {
    /** 儲存設定規格 */
    storage?: StorageConfig;
    /** 代理人設定規格 */
    agent?: AgentConfig;
    /** 儲存基礎根目錄 (可覆寫 storage.base_dir) */
    baseDir?: string;
    /** 日誌記錄器實例 */
    logger?: LogManager;
    /** 觸發大資料卸載的通用預設字元門檻 (兼容舊設定，預設作為 new_message 門檻) */
    defaultThreshold?: number;
    /** 收到新訊息時觸發大資料卸載的寬鬆門檻 (可覆寫 agent.offload_threshold_new_message) */
    thresholdNewMessage?: number;
    /** 舊歷史滑動壓縮時觸發大資料卸載的嚴格門檻 (可覆寫 agent.offload_threshold_compact) */
    thresholdCompact?: number;
    /** Blob 檔案儲存子目錄名稱 (可覆寫 storage.blob_dir) */
    blobDirName?: string;
    /** Agent 軌跡子目錄名稱 (可覆寫 storage.agent_dir) */
    agentDirName?: string;
    /** 每日總結子目錄名稱 (可覆寫 storage.summary_dir) */
    summaryDirName?: string;
    /** 歷史記錄檔案名稱 (可覆寫 storage.history_file) */
    historyFileName?: string;
}

/**
 * 基於 JSONL 格式的 DataBlock 全量歷史軌跡儲存庫 (FileSystemDataBlockRepository)
 * 繼承 packages/storage 的 BaseJsonlRepository<T> 基礎設施
 * 負責將 Agent 在會話中的每一筆對話、思考過程與工具產出以 Append-Only 方式永久追加至磁碟
 * 路徑規範：{baseDir}/{sessionId}/{agentDirName}/{agentId}/{historyFileName}
 */
export class FileSystemDataBlockRepository extends BaseJsonlRepository<DataBlockData> {
    private readonly logger: LogManager;
    private readonly enablePayloadOffload: boolean;
    private readonly thresholdNewMessage: number;
    private readonly thresholdCompact: number;
    private readonly maxHistoryLinesSafetyCap: number;
    private readonly blobDirName: string;
    private readonly agentDirName: string;
    private readonly summaryDirName: string;
    private readonly historyFileName: string;

    constructor(options: FileSystemDataBlockRepositoryOptions = {}) {
        // 保留 options.baseDir 的最高優先級；若未顯式傳入，則自動由 baseDir + session_dir 自行組裝
        let targetDir: string;
        if (options.baseDir) {
            targetDir = options.baseDir;
        } else {
            const rootDir = options.storage?.base_dir ?? DEFAULT_STORAGE_CONFIG.base_dir;
            const sessionDir = options.storage?.session_dir ?? DEFAULT_STORAGE_CONFIG.session_dir;
            targetDir = path.join(rootDir, sessionDir);
        }

        const resolvedBaseDir = path.resolve(targetDir);
        super(resolvedBaseDir);

        this.enablePayloadOffload =
            options.agent?.enable_payload_offload ??
            DEFAULT_AGENT_CONFIG.enable_payload_offload;
        this.thresholdNewMessage =
            options.thresholdNewMessage ??
            options.defaultThreshold ??
            options.agent?.offload_threshold_new_message ??
            DEFAULT_AGENT_CONFIG.offload_threshold_new_message;
        this.thresholdCompact =
            options.thresholdCompact ??
            options.agent?.offload_threshold_compact ??
            DEFAULT_AGENT_CONFIG.offload_threshold_compact;
        this.maxHistoryLinesSafetyCap =
            options.agent?.max_history_lines_safety_cap ??
            DEFAULT_AGENT_CONFIG.max_history_lines_safety_cap;
        this.blobDirName =
            options.blobDirName ??
            options.storage?.blob_dir ??
            DEFAULT_STORAGE_CONFIG.blob_dir;
        this.agentDirName =
            options.agentDirName ??
            options.storage?.agent_dir ??
            DEFAULT_STORAGE_CONFIG.agent_dir;
        this.summaryDirName =
            options.summaryDirName ??
            options.storage?.summary_dir ??
            DEFAULT_STORAGE_CONFIG.summary_dir;
        this.historyFileName =
            options.historyFileName ??
            options.storage?.history_file ??
            DEFAULT_STORAGE_CONFIG.history_file;

        this.logger =
            options.logger ??
            new LogManager({ type: 'SYSTEM', name: 'FileSystemDataBlockRepository' }).addTransport(
                new ConsoleTransport('DEBUG')
            );
    }

    /**
     * 取得指定會話與 Agent 的歷史軌跡 JSONL 檔案路徑
     * @param sessionId 會話識別碼
     * @param agentId 代理識別碼
     * @param dateStr 可選日期後綴 (用於輪轉歸檔)
     */
    protected getFilePath(sessionId: string, agentId: string, dateStr?: string): string {
        const safeSessionId = path.basename(sessionId);
        const safeAgentId = path.basename(agentId);
        const fileName = dateStr ? `history_${dateStr}.jsonl` : this.historyFileName;
        return path.join(this.baseDir, safeSessionId, this.agentDirName, safeAgentId, fileName);
    }

    /**
     * 以 Append-Only 模式將單一或批次 DataBlock 追加寫入磁碟 (全量軌跡保存)
     * @param sessionId 會話 ID
     * @param agentId 代理 ID
     * @param blockOrBlocks 欲追加保存的 DataBlock 實體或陣列
     */
    public async appendForAgent(
        sessionId: string,
        agentId: string,
        blockOrBlocks: DataBlock | DataBlock[]
    ): Promise<void> {
        const blocks = Array.isArray(blockOrBlocks) ? blockOrBlocks : [blockOrBlocks];
        if (blocks.length === 0) {
            return;
        }

        const filePath = this.getFilePath(sessionId, agentId);
        const rawItems: DataBlockData[] = blocks.map((b) => b.toJSON());

        try {
            await this.appendJsonl(filePath, rawItems);
            this.logger.debug(
                `Appended ${blocks.length} blocks to history [${filePath}] for agent [${agentId}]`
            );
        } catch (error: any) {
            this.logger.error(
                `Failed to append history for agent [${agentId}] in session [${sessionId}]: ${error.message}`
            );
            throw error;
        }
    }

    /**
     * 讀取指定 Agent 在特定會話中的歷史軌跡 (具備 max_history_lines_safety_cap 安全熔斷)
     * @param sessionId 會話 ID
     * @param agentId 代理 ID
     * @returns 已還原為 DataBlock 實體陣列的歷史軌跡
     */
    public async findByAgent(sessionId: string, agentId: string): Promise<DataBlock[]> {
        const filePath = this.getFilePath(sessionId, agentId);

        try {
            const rawItems = await this.readAllJsonl(filePath);
            const cappedItems =
                this.maxHistoryLinesSafetyCap > 0 &&
                rawItems.length > this.maxHistoryLinesSafetyCap
                    ? rawItems.slice(-this.maxHistoryLinesSafetyCap)
                    : rawItems;
            return cappedItems.map((item) => DataBlock.fromJSON(item));
        } catch (error: any) {
            this.logger.error(
                `Failed to read history for agent [${agentId}] in session [${sessionId}]: ${error.message}`
            );
            return [];
        }
    }

    /**
     * 全量覆寫指定 Agent 的歷史檔案 (常用於軌跡壓縮、過濾或資料修復)
     * @param sessionId 會話 ID
     * @param agentId 代理 ID
     * @param blocks 新的完整 DataBlock 陣列
     */
    public async saveForAgent(
        sessionId: string,
        agentId: string,
        blocks: DataBlock[]
    ): Promise<void> {
        const filePath = this.getFilePath(sessionId, agentId);
        const rawItems = blocks.map((b) => b.toJSON());

        try {
            await this.overwriteJsonl(filePath, rawItems);
            this.logger.debug(
                `Overwrote history file [${filePath}] with ${blocks.length} blocks for agent [${agentId}]`
            );
        } catch (error: any) {
            this.logger.error(
                `Failed to overwrite history for agent [${agentId}] in session [${sessionId}]: ${error.message}`
            );
            throw error;
        }
    }

    /**
     * 輪轉歷史日誌檔案 (將當前 history.jsonl 重命名為帶有日期的歸檔檔名)
     * @param sessionId 會話 ID
     * @param agentId 代理 ID
     * @param dateString 日期標籤 (例如 '2026-09-23')
     */
    public async rotateHistoryFile(
        sessionId: string,
        agentId: string,
        dateString: string
    ): Promise<void> {
        const currentFile = this.getFilePath(sessionId, agentId);
        const rotatedFile = this.getFilePath(sessionId, agentId, dateString);

        try {
            await fs.rename(currentFile, rotatedFile);
            this.logger.info(`Rotated history file for agent [${agentId}] to ${rotatedFile}`);
        } catch (error: any) {
            this.logger.warn(
                `Failed to rotate history file for agent [${agentId}]: ${error.message}`
            );
        }
    }

    /**
     * 檢查並將超大字串非同步卸載為磁碟 Blob 檔案與 DataPointer 指標
     * 實踐「控制面與資料面分離」，防止超長字串 (如網頁原始碼、巨大終端日誌) 撐爆記憶體或歷史對話上下文
     * 此方法保證不突變 (Mutate) 原始的 DataBlock 物件，而是複製產生不可變之全新實例
     * @param sessionId 會話 ID
     * @param block 欲檢查與卸載的 DataBlock 實例
     * @param modeOrThreshold 自定義字元門檻數字，或指定 'new_message' (即時新訊息) / 'compact' (歷史壓縮) 階段
     * @returns 瘦身後的全新 DataBlock 實例 (若未超標則回傳原物件)
     */
    public async offloadLargePayloads(
        sessionId: string,
        block: DataBlock,
        modeOrThreshold?: number | 'new_message' | 'compact'
    ): Promise<DataBlock> {
        // 全局開關驗證：若未開啟大資料卸載功能，直接回傳原區塊
        if (!this.enablePayloadOffload) {
            return block;
        }

        let actualThreshold: number;
        if (typeof modeOrThreshold === 'number') {
            actualThreshold = modeOrThreshold;
        } else if (modeOrThreshold === 'compact') {
            actualThreshold = this.thresholdCompact;
        } else {
            actualThreshold = this.thresholdNewMessage;
        }

        // 增量標記檢查：若該區塊已完成壓縮/卸載處理，則直接跳過避免重複 I/O
        if (block.isCompacted) {
            return block;
        }

        // 大小驗證：若長度在安全門檻以內，直接標記為已精簡並回傳原物件
        if (block.validateSize(actualThreshold)) {
            block.isCompacted = true;
            return block;
        }

        const safeSessionId = path.basename(sessionId);
        const blobsDir = path.join(this.baseDir, safeSessionId, this.blobDirName);

        // 確保 Session 的 blobs 實體目錄存在
        if (!existsSync(blobsDir)) {
            await fs.mkdir(blobsDir, { recursive: true });
        }

        const newDataPointers = [...block.dataPointers];

        // 遞迴遍歷 Payload 節點，找出所有長度 >= 門檻的字串並非同步替換為 Blob 指標
        const { newPayload, hasChanges } = await DataBlock.traverseAndReplaceLargeStrings(
            block.controlPayload,
            actualThreshold,
            async (largeString: string) => {
                const blobId = IdGenerator.blob();
                const blobPath = path.join(blobsDir, `${blobId}.txt`);

                // 將完整巨大內容寫入實體磁碟檔案
                await fs.writeFile(blobPath, largeString, 'utf-8');

                // 註冊 DataPointer 指標
                newDataPointers.push({
                    type: 'FILE',
                    uri: blobId,
                    metadata: {
                        originalLength: largeString.length,
                        preview: largeString.substring(0, 100) + '...',
                    },
                });

                const previewText = largeString.substring(0, 100).replace(/\r?\n/g, ' ') + '...';
                return `<Pointer: ${blobId} (Preview: ${previewText})>`;
            }
        );

        if (!hasChanges) {
            block.isCompacted = true;
            return block;
        }

        // 不可變原則：透過 toJSON 與 fromJSON 重建全新的 DataBlock 實例
        const blockData = block.toJSON();
        blockData.controlPayload = newPayload;
        blockData.dataPointers = newDataPointers;

        const newBlock = DataBlock.fromJSON(blockData);
        newBlock.isCompacted = true;
        this.logger.debug(
            `Offloaded large payload in block [${block.id}] for session [${sessionId}], generated ${newDataPointers.length - block.dataPointers.length} blobs`
        );
        return newBlock;
    }

    /**
     * 讀取先前卸載至實體磁碟的 Blob 檔案原始字串內容
     * @param sessionId 會話 ID
     * @param blobId Blob 識別碼 (例如 blob_xxx)
     * @returns 原始字串內容
     */
    public async readBlob(sessionId: string, blobId: string): Promise<string> {
        const safeSessionId = path.basename(sessionId);
        const safeBlobId = path.basename(blobId);
        const blobPath = path.join(this.baseDir, safeSessionId, this.blobDirName, `${safeBlobId}.txt`);

        try {
            return await fs.readFile(blobPath, 'utf-8');
        } catch (error: any) {
            this.logger.error(
                `Failed to read blob [${blobId}] in session [${sessionId}]: ${error.message}`
            );
            throw error;
        }
    }

    /**
     * 列出特定 Session 底下所有已保存歷史軌跡的 Agent ID 清單
     * @param sessionId 會話 ID
     */
    public async listAgentsForSession(sessionId: string): Promise<string[]> {
        const safeSessionId = path.basename(sessionId);
        const agentsDir = path.join(this.baseDir, safeSessionId, this.agentDirName);

        if (!existsSync(agentsDir)) {
            return [];
        }

        try {
            const dirents = await fs.readdir(agentsDir, { withFileTypes: true });
            return dirents.filter((d) => d.isDirectory()).map((d) => d.name);
        } catch (error: any) {
            this.logger.warn(`Failed to list agents for session [${sessionId}]: ${error.message}`);
            return [];
        }
    }

    /**
     * 儲存每日記憶總結 (Markdown 格式)
     * @param sessionId 會話 ID
     * @param dateString 日期字串 (例如 '2026-09-23')
     * @param summaryMarkdown 總結內容
     */
    public async saveDailySummary(
        sessionId: string,
        dateString: string,
        summaryMarkdown: string
    ): Promise<void> {
        const safeSessionId = path.basename(sessionId);
        const safeDate = path.basename(dateString);
        const summariesDir = path.join(this.baseDir, safeSessionId, this.summaryDirName);

        if (!existsSync(summariesDir)) {
            await fs.mkdir(summariesDir, { recursive: true });
        }

        const summaryFile = path.join(summariesDir, `${safeDate}.md`);
        await fs.writeFile(summaryFile, summaryMarkdown, 'utf-8');
        this.logger.info(`Saved daily summary to [${summaryFile}]`);
    }

    /**
     * 讀取特定會話近 N 天的每日總結清單
     * @param sessionId 會話 ID
     * @param maxDays 讀取最多天數 (預設 3 天)
     * @returns 總結 Markdown 內容陣列 (時間由舊到新排序)
     */
    public async getRecentSummaries(sessionId: string, maxDays: number = 3): Promise<string[]> {
        const safeSessionId = path.basename(sessionId);
        const summariesDir = path.join(this.baseDir, safeSessionId, this.summaryDirName);

        if (!existsSync(summariesDir)) {
            return [];
        }

        try {
            const dirents = await fs.readdir(summariesDir, { withFileTypes: true });
            const files = dirents
                .filter((d) => d.isFile() && d.name.endsWith('.md'))
                .map((d) => d.name)
                .sort((a, b) => b.localeCompare(a)) // 檔名降序排，最新的在前面
                .slice(0, maxDays);

            const summaries: string[] = [];
            for (const file of files) {
                const filePath = path.join(summariesDir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                summaries.push(content);
            }

            // 反轉使最舊的在前面，符合閱讀順序
            return summaries.reverse();
        } catch (error: any) {
            this.logger.warn(`Failed to read summaries for session [${sessionId}]: ${error.message}`);
            return [];
        }
    }
}
