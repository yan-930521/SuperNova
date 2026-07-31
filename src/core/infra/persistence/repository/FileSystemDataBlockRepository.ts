import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Config } from '../../../config/Config';
import { DataBlock } from '../../../messaging/DataBlock';
import { IdGenerator } from '../../../utils/IdGenerator';
import { LogManager } from '../../LogManager';
import { IDataBlockRepository } from '../IRepository';

/**
 * FileSystemDataBlockRepository
 * 基於本地檔案系統的訊息歷史儲存庫實現，所有資料以 JSONL 格式存放在 `workspace/session/{sessionId}/agents/{agentId}/history.jsonl`
 * 實作了 IRepository<DataBlock> 與 IDataBlockRepository 介面。
 */
export class FileSystemDataBlockRepository implements IDataBlockRepository {
    private readonly logger = LogManager.recorder;

    constructor(
        private readonly config: Config,
        private readonly baseDir: string
    ) {
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
            this.logger.debug(`[DataBlockRepository] Overwrote history for agent ${agentId} under session ${sessionId}`);
        } catch (err: any) {
            this.logger.error(`[DataBlockRepository] Failed to save history for agent ${agentId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 追加單筆 DataBlock 至特定 Agent 的歷史末尾 (JSONLine 追加)
     */
    public async appendForAgent(sessionId: string, agentId: string, block: DataBlock<any>): Promise<void> {
        const historyFilePath = this.getFileName(sessionId, agentId);

        try {
            const line = JSON.stringify(block.toJSON()) + '\n';

            // 追加寫入
            await fs.appendFile(historyFilePath, line, 'utf-8');
            this.logger.debug(`[DataBlockRepository] Appended history for agent ${agentId} under session ${sessionId}`);
        } catch (err: any) {
            this.logger.error(`[DataBlockRepository] Failed to append history for agent ${agentId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 讀取並還原特定 Agent 的所有 DataBlock 歷史 (逐行解析 JSONL)
     */
    public async findByAgent(sessionId: string, agentId: string): Promise<DataBlock<any>[]> {
        const historyFilePath = this.getFileName(sessionId, agentId);

        if (!existsSync(historyFilePath)) {
            this.logger.debug(`[DataBlockRepository] History file not found: ${historyFilePath}`);
            return [];
        }

        try {
            const content = await fs.readFile(historyFilePath, 'utf-8');
            const lines = content.split('\n');
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

            return blocks;
    } catch (err: any) {
            this.logger.error(`[DataBlockRepository] Failed to read history for agent ${agentId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 檢查並將超大字串卸載為 DataPointer，並回傳更新後的 DataBlock。
     */
    public async offloadLargePayloads(sessionId: string, block: DataBlock<any>, thresholdBytes: number = 2000): Promise<DataBlock<any>> {
        if (block.validateSize(thresholdBytes)) {
            return block; // 大小合格，不需要卸載
        }

        const blobsDir = path.join(this.baseDir, sessionId, this.config.storage.blob_dir);
        if (!existsSync(blobsDir)) {
            mkdirSync(blobsDir, { recursive: true });
        }

        const newDataPointers = [...block.dataPointers];

        const { newPayload, hasChanges } = await DataBlock.traverseAndReplaceLargeStrings(
            block.controlPayload,
            thresholdBytes,
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
        return DataBlock.fromJSON(blockData);
    }

    // --- 內部輔助方法 ---
    private getDirName(
        sessionId: string,
        agentId: string
    ): string {
        const agentDir = path.join(this.baseDir, sessionId, this.config.storage.agent_dir, agentId);
        if (!existsSync(agentDir)) {
            mkdirSync(agentDir, { recursive: true });
        }
        return agentDir;
    }

    private getFileName(
        sessionId: string,
        agentId: string
    ): string {
        const filePath = path.join(this.getDirName(sessionId, agentId), this.config.storage.history_file);
        return filePath;
    }
}
