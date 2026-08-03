import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Config } from '../../../config/Config';
import { DEFAULT_CONFIG } from '../../../config/DefaultConfig';
import { DataBlock } from '../../../messaging/DataBlock';
import { IdGenerator } from '../../../utils/IdGenerator';
import { LRUCache } from '../../../utils/LRUCache';
import { LogManager } from '../../LogManager';
import { IDataBlockRepository } from '../IRepository';

/**
 * FileSystemDataBlockRepository
 * 基於本地檔案系統的訊息歷史儲存庫實現，所有資料以 JSONL 格式存放在 `workspace/session/{sessionId}/agents/{agentId}/history.jsonl`
 * 實作了 IRepository<DataBlock> 與 IDataBlockRepository 介面。
 */
export class FileSystemDataBlockRepository implements IDataBlockRepository {
    private readonly logger = LogManager.recorder;

    // 記憶體快取：以 `${sessionId}:${agentId}` 為 Key
    private readonly cache: LRUCache<string, DataBlock<any>[]>;

    constructor(
        private readonly config: Config,
        private readonly baseDir: string
    ) {
        const lruSize = this.config?.cache?.history_lru_size ?? DEFAULT_CONFIG.cache.history_lru_size;
        this.cache = new LRUCache<string, DataBlock<any>[]>(lruSize);
    }

    // --- ILifecycle 實作 ---
    public async initialize(): Promise<void> { }
    public async start(): Promise<void> { }
    public async stop(): Promise<void> { }


    // --- IDataBlockRepository 專屬極簡 API 實作 ---

    /**
     * 覆寫特定 Agent 的事件與對話歷史 (以 JSONL 覆寫)
     */
    public async saveForAgent(sessionId: string, agentId: string, blocks: DataBlock<any>[]): Promise<void> {
        const historyFilePath = this.getFileName(sessionId, agentId);

        try {
            const lines = blocks.map(b => JSON.stringify(b.toJSON())).join('\n') + '\n';

            // 覆寫寫入
            await fs.writeFile(historyFilePath, lines, 'utf-8');
            
            // 更新快取
            const cacheKey = `${sessionId}:${agentId}`;
            this.cache.set(cacheKey, [...blocks]);
            
            this.logger.debug(`[DataBlockRepository] Overwrote history for agent ${agentId} under session ${sessionId}`);
        } catch (err: any) {
            this.logger.error(`[DataBlockRepository] Failed to save history for agent ${agentId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 追加單筆或多筆 DataBlock 至特定 Agent 的歷史末尾 (JSONLine 批次追加)
     */
    public async appendForAgent(sessionId: string, agentId: string, blockOrBlocks: DataBlock<any> | DataBlock<any>[]): Promise<void> {
        const historyFilePath = this.getFileName(sessionId, agentId);
        const blocks = Array.isArray(blockOrBlocks) ? blockOrBlocks : [blockOrBlocks];
        if (blocks.length === 0) return;

        try {
            const lines = blocks.map(b => JSON.stringify(b.toJSON())).join('\n') + '\n';

            // 批次追加寫入 (Single I/O)
            await fs.appendFile(historyFilePath, lines, 'utf-8');
            
            // 更新快取
            const cacheKey = `${sessionId}:${agentId}`;
            const existing = this.cache.get(cacheKey);
            if (existing) {
                existing.push(...blocks);
            }
            
            this.logger.debug(`[DataBlockRepository] Appended ${blocks.length} blocks to history for agent ${agentId} under session ${sessionId}`);
        } catch (err: any) {
            this.logger.error(`[DataBlockRepository] Failed to append history for agent ${agentId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 讀取並還原特定 Agent 的 DataBlock 歷史 (逐行解析 JSONL)
     */
    public async findByAgent(sessionId: string, agentId: string): Promise<readonly DataBlock<any>[]> {
        const cacheKey = `${sessionId}:${agentId}`;
        const cached = this.cache.get(cacheKey);

        if (cached) {
            // 回傳唯讀參考，零拷貝
            return cached;
        }

        const historyFilePath = this.getFileName(sessionId, agentId);

        if (!existsSync(historyFilePath)) {
            this.logger.debug(`[DataBlockRepository] History file not found: ${historyFilePath}`);
            return [];
        }

        try {
            const content = await fs.readFile(historyFilePath, 'utf-8');
            let lines = content.split('\n');
            
            // 安全上限 (Safety Cap)：在 JSON.parse 前強制切片，防止 OOM
            const safetyCap = this.config?.agent?.max_history_lines_safety_cap ?? DEFAULT_CONFIG.agent.max_history_lines_safety_cap;
            if (lines.length > safetyCap) {
                lines = lines.slice(-safetyCap);
            }

            const blocks: DataBlock<any>[] = [];

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                    const data = JSON.parse(trimmed);
                    blocks.push(DataBlock.fromJSON(data));
                } catch (parseErr: any) {
                    this.logger.error(`[DataBlockRepository] Error parsing line in ${historyFilePath}: ${parseErr.message}`);
                }
            }

            // 寫入快取，此處存入的即是受安全上限保護的乾淨歷史
            this.cache.set(cacheKey, blocks);

            return blocks;
    } catch (err: any) {
            this.logger.error(`[DataBlockRepository] Failed to read history for agent ${agentId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 檢查並將超大字串卸載為 DataPointer，並回傳更新後的 DataBlock。
     */
    public async offloadLargePayloads(sessionId: string, block: DataBlock<any>, thresholdLength?: number): Promise<DataBlock<any>> {
        const actualThreshold = thresholdLength ?? this.config?.agent?.offload_threshold_new_message ?? DEFAULT_CONFIG.agent.offload_threshold_new_message;

        // 增量標記：若已處理過則直接跳過
        if (block.isCompacted) {
            return block;
        }

        if (block.validateSize(actualThreshold)) {
            block.isCompacted = true;
            return block; // 大小合格，不需要卸載
        }

        const blobDirName = this.config?.storage?.blob_dir ?? DEFAULT_CONFIG.storage.blob_dir;
        const blobsDir = path.join(this.baseDir, sessionId, blobDirName);
        if (!existsSync(blobsDir)) {
            mkdirSync(blobsDir, { recursive: true });
        }

        const newDataPointers = [...block.dataPointers];

        const { newPayload, hasChanges } = await DataBlock.traverseAndReplaceLargeStrings(
            block.controlPayload,
            actualThreshold,
            async (largeString) => {
                const blobId = IdGenerator.blob();
                const blobPath = path.join(blobsDir, `${blobId}.txt`);
                
                // 寫入實體硬碟
                await fs.writeFile(blobPath, largeString, 'utf-8');
                
                newDataPointers.push({
                    type: 'FILE',
                    uri: blobId,
                    metadata: {
                        originalLength: largeString.length,
                        preview: largeString.substring(0, 100) + '...'
                    }
                });

                const previewText = largeString.substring(0, 100).replace(/\r?\n/g, ' ') + '...';
                return `<Pointer: ${blobId} (Preview: ${previewText})>`;
            }
        );

        if (!hasChanges) {
            return block;
        }

        this.logger.debug(`[DataBlockRepository] Offloaded large payload in block ${block.id}`);
        
        // 建立並回傳一個全新的 DataBlock (不可變)
        const blockData = block.toJSON();
        blockData.controlPayload = newPayload;
        blockData.dataPointers = newDataPointers;
        const newBlock = DataBlock.fromJSON(blockData);
        newBlock.isCompacted = true;
        return newBlock;
    }

    // --- 內部輔助方法 ---
    private getDirName(
        sessionId: string,
        agentId: string
    ): string {
        const agentDirName = this.config?.storage?.agent_dir ?? DEFAULT_CONFIG.storage.agent_dir;
        const agentDir = path.join(this.baseDir, sessionId, agentDirName, agentId);
        if (!existsSync(agentDir)) {
            mkdirSync(agentDir, { recursive: true });
        }
        return agentDir;
    }

    private getFileName(
        sessionId: string,
        agentId: string
    ): string {
        const historyFileName = this.config?.storage?.history_file ?? DEFAULT_CONFIG.storage.history_file;
        const filePath = path.join(this.getDirName(sessionId, agentId), historyFileName);
        return filePath;
    }
}
