import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { BaseAgentData } from '../../../agent/BaseAgent';
import { Config } from '../../../config/Config';
import { LogManager } from '../../LogManager';
import { IAgentStateRepository } from '../IRepository';

/**
 * FileSystemAgentStateRepository
 * 基於本地檔案系統的 Agent 狀態快照儲存庫實現。
 * 保存於 `workspace/session/{sessionId}/agents/{agentId}/`
 */
export class FileSystemAgentStateRepository implements IAgentStateRepository {
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

    /**
     * 保存 Agent 的狀態快照資料
     */
    public async saveAgentState(
        sessionId: string,
        agentId: string,
        state: BaseAgentData
    ): Promise<void> {
        const filePath = this.getFileName(sessionId, agentId);

        try {
            const data = JSON.stringify(state, null, 2);
            await fs.writeFile(filePath, data, 'utf-8');
            this.logger.debug(`[AgentStateRepository] State saved successfully to ${filePath}`);
        } catch (err: any) {
            this.logger.error(`[AgentStateRepository] Failed to save state to ${filePath}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 讀取並還原 Agent 的狀態快照資料
     */
    public async loadAgentState(
        sessionId: string,
        agentId: string
    ): Promise<BaseAgentData | null> {
        const filePath = this.getFileName(sessionId, agentId);

        if (!existsSync(filePath)) {
            this.logger.debug(`[AgentStateRepository] State file not found: ${filePath}`);
            return null;
        }
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as BaseAgentData;
        } catch (err: any) {
            this.logger.error(`[AgentStateRepository] Failed to load state from ${filePath}: ${err.message}`);
            throw err;
        }
    }

    // --- 內部輔助方法 ---
    private getDirName(
        sessionId: string,
        agentId: string
    ): string {
        const targetId = agentId;
        const agentDir = path.join(this.baseDir, sessionId, this.config.storage.agent_dir, targetId);
        if (!existsSync(agentDir)) {
            mkdirSync(agentDir, { recursive: true });
        }
        return agentDir;
    }

    private getFileName(
        sessionId: string,
        agentId: string
    ): string {
        const targetDir = this.getDirName(sessionId, agentId);
        return path.join(targetDir, this.config.storage.agent_state_file);
    }
}
