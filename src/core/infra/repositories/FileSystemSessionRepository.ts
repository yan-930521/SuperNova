import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Config } from '../../config/Config';
import { ISessionRepository } from '../../domain/IRepository';
import { Session } from '../../session/Session';
import { LogManager } from '../LogManager';
import { ConsoleTransport } from '../transports';

/**
 * FileSystemSessionRepository
 * 基於本地檔案系統的會話儲存庫實現，所有資料存放在 `workspace/session/{sessionId}/session.json`
 */
export class FileSystemSessionRepository implements ISessionRepository {
    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'FileSystemSessionRepository' }).addTransport(new ConsoleTransport('DEBUG'));

    constructor(
        private readonly config: Config,
        private readonly baseDir: string
    ) {
    }

    // --- ILifecycle 實作 ---
    public async initialize(): Promise<void> { }
    public async start(): Promise<void> { }
    public async stop(): Promise<void> { }

    public async save(session: Session): Promise<void> {
        const sessionDir = this.getDirName(session.id);
        const sessionFilePath = this.getFileName(session.id);

        try {
            if (!existsSync(sessionDir)) {
                await fs.mkdir(sessionDir, { recursive: true });
            }

            const data = JSON.stringify(session.toJSON(), null, 2);
            await fs.writeFile(sessionFilePath, data, 'utf-8');
            this.logger.debug(`Session ${session.id} saved successfully`);
        } catch (err: any) {
            this.logger.error(`Failed to save session ${session.id}: ${err.message}`);
            throw err;
        }
    }

    public async load(sessionId: string): Promise<Session | null> {
        const sessionFilePath = this.getFileName(sessionId);

        if (!existsSync(sessionFilePath)) {
            this.logger.debug(`Session file not found: ${sessionFilePath}`);
            return null;
        }

        try {
            const content = await fs.readFile(sessionFilePath, 'utf-8');
            const data = JSON.parse(content);
            return Session.fromJSON(data);
        } catch (err: any) {
            this.logger.error(`Failed to load session ${sessionId}: ${err.message}`);
            throw err;
        }
    }

    public async delete(sessionId: string): Promise<void> {
        const sessionDir = path.join(this.baseDir, sessionId);
        if (existsSync(sessionDir)) {
            try {
                await fs.rm(sessionDir, { recursive: true, force: true });
                this.logger.info(`Deleted session directory: ${sessionDir}`);
            } catch (err: any) {
                this.logger.error(`Failed to delete session ${sessionId}: ${err.message}`);
                throw err;
            }
        }
    }

    public async list(): Promise<string[]> {
        try {
            if (!existsSync(this.baseDir)) return [];
            const dirs = await fs.readdir(this.baseDir);
            const sessionIds: string[] = [];

            for (const dirName of dirs) {
                const sessionFilePath = this.getFileName(dirName);
                if (existsSync(sessionFilePath)) {
                    sessionIds.push(dirName);
                }
            }

            return sessionIds;
        } catch (err: any) {
            this.logger.error(`Failed to list sessions: ${err.message}`);
            throw err;
        }
    }

    public async exists(sessionId: string): Promise<boolean> {
        const sessionFilePath = path.join(this.baseDir, sessionId, 'session.json');
        return existsSync(sessionFilePath);
    }

    // --- 內部輔助方法 ---
    private getDirName(
        sessionId: string
    ): string {
        const agentDir = path.join(this.baseDir, sessionId);
        if (!existsSync(agentDir)) {
            mkdirSync(agentDir, { recursive: true });
        }
        return agentDir;
    }

    private getFileName(
        sessionId: string
    ): string {
        const filePath = path.join(this.getDirName(sessionId), this.config.storage.session_file);
        return filePath;
    }
}
