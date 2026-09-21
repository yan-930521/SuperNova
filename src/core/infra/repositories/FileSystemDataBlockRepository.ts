import { Config } from '../../config/Config';
import { IDataBlockRepository } from '../../domain/IRepository';
import { DataBlock } from '../../messaging/DataBlock';
import { BaseJsonlRepository } from '@supernova/storage/base/BaseJsonlRepository';
import path from 'path';
import fs from 'fs/promises';

export class FileSystemDataBlockRepository extends BaseJsonlRepository<DataBlock<any>> implements IDataBlockRepository {
    constructor(private readonly config: Config, baseDir: string) {
        super(baseDir);
    }

    public async initialize(): Promise<void> { }
    public async start(): Promise<void> { }
    public async stop(): Promise<void> { }

    protected getFilePath(sessionId: string, agentId: string, dateStr?: string): string {
        const file = dateStr ? `history_${dateStr}.jsonl` : 'history.jsonl';
        return path.join(this['baseDir'], sessionId, 'agents', agentId, file);
    }

    public async saveForAgent(sessionId: string, agentId: string, blocks: DataBlock<any>[]): Promise<void> {
        await this.overwriteJsonl(this.getFilePath(sessionId, agentId), blocks);
    }

    public async appendForAgent(sessionId: string, agentId: string, blockOrBlocks: DataBlock<any> | DataBlock<any>[]): Promise<void> {
        await this.appendJsonl(this.getFilePath(sessionId, agentId), blockOrBlocks);
    }

    public async findByAgent(sessionId: string, agentId: string): Promise<readonly DataBlock<any>[]> {
        return await this.readAllJsonl(this.getFilePath(sessionId, agentId));
    }
    
    public async offloadLargePayloads(sessionId: string, block: DataBlock<any>, thresholdLength?: number): Promise<DataBlock<any>> {
        // 暫時保留原狀，不實作細節
        return block;
    }

    public async rotateHistoryFile(sessionId: string, agentId: string, dateString: string): Promise<void> {
        const oldFile = this.getFilePath(sessionId, agentId);
        const newFile = this.getFilePath(sessionId, agentId, dateString);
        try {
            await fs.rename(oldFile, newFile);
        } catch (e) {}
    }

    public async saveDailySummary(sessionId: string, dateString: string, summaryMarkdown: string): Promise<void> {
        const summaryFile = path.join(this['baseDir'], sessionId, 'summaries', `${dateString}.md`);
        await fs.mkdir(path.dirname(summaryFile), { recursive: true });
        await fs.writeFile(summaryFile, summaryMarkdown, 'utf-8');
    }

    public async getRecentSummaries(sessionId: string, agentId: string, maxDays?: number): Promise<string[]> {
        return [];
    }

    public async listAgentsForSession(sessionId: string): Promise<string[]> {
        return [];
    }
}
