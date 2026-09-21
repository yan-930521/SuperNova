import { Config } from '../../config/Config';
import { IAgentStateRepository } from '../../domain/IRepository';
import { BaseAgentData } from '../../agent/BaseAgent';
import { BaseJsonRepository } from '@supernova/storage/base/BaseJsonRepository';
import path from 'path';

export class FileSystemAgentStateRepository extends BaseJsonRepository<BaseAgentData> implements IAgentStateRepository {
    constructor(private readonly config: Config, baseDir: string) {
        super(baseDir);
    }

    public async initialize(): Promise<void> { }
    public async start(): Promise<void> { }
    public async stop(): Promise<void> { }

    protected getFilePath(sessionId: string, agentId: string): string {
        return path.join(this['baseDir'], sessionId, 'agents', agentId, 'state.json');
    }

    public async saveAgentState(sessionId: string, agentId: string, state: BaseAgentData): Promise<void> {
        await this.writeJson(this.getFilePath(sessionId, agentId), state);
    }

    public async loadAgentState(sessionId: string, agentId: string): Promise<BaseAgentData | null> {
        return await this.readJson(this.getFilePath(sessionId, agentId));
    }
}
