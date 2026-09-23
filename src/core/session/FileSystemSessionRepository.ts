import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { BaseJsonRepository } from '@supernova/storage';

import { Session } from './Session';
import { ISession, ISessionRepository, SessionData } from './types';
import { DEFAULT_STORAGE_CONFIG, StorageConfig } from '../config';

/**
 * 本地檔案系統會話儲存庫配置選項
 */
export interface FileSystemSessionRepositoryOptions {
    /** 儲存設定規格 */
    storage?: StorageConfig;
    /** 儲存會話檔案的基礎目錄路徑 (可覆寫 storage.base_dir) */
    baseDir?: string;
    /** 日誌記錄器實例 */
    logger?: LogManager;
}

/**
 * 磁碟持久化的會話記錄封裝結構
 */
export interface PersistedSessionRecord extends SessionData {
    /** 資料結構版本號 */
    schemaVersion: string;
}

/**
 * 基於本地檔案系統的會話儲存庫 (FileSystemSessionRepository)
 * 繼承 packages/storage 的 BaseJsonRepository<T> 基礎設施
 * 負責 Session 實體及 inboxBuffer 隊列的本地 JSON 檔案持久化、讀取、刪除與枚舉
 */
export class FileSystemSessionRepository
    extends BaseJsonRepository<PersistedSessionRecord>
    implements ISessionRepository
{
    private readonly logger: LogManager;

    constructor(options: FileSystemSessionRepositoryOptions = {}) {
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

        this.logger =
            options.logger ??
            new LogManager({ type: 'SYSTEM', name: 'FileSystemSessionRepository' }).addTransport(
                new ConsoleTransport('DEBUG')
            );
    }

    /**
     * 取得目前配置的基礎目錄路徑
     */
    public getBaseDir(): string {
        return this.baseDir;
    }

    /**
     * 實作 BaseJsonRepository 抽象方法：解析特定會話的磁碟檔案路徑
     * @param sessionId 會話識別碼
     */
    protected getFilePath(sessionId: string): string {
        // 使用 path.basename 防止路徑穿越安全性漏洞
        const safeSessionId = path.basename(sessionId);
        return path.join(this.baseDir, `${safeSessionId}.json`);
    }

    /**
     * 將會話狀態及收件箱隊列持久化保存至磁碟
     * @param session 欲保存的會話實體
     */
    public async save(session: ISession): Promise<void> {
        const filePath = this.getFilePath(session.id);
        const record: PersistedSessionRecord = {
            schemaVersion: '1.0',
            ...session.toJSON(),
        };

        try {
            await this.writeJson(filePath, record);
            this.logger.debug(`Saved session [${session.id}] to ${filePath}`);
        } catch (error: any) {
            this.logger.error(`Failed to save session [${session.id}]: ${error.message}`);
            throw error;
        }
    }

    /**
     * 從磁碟載入並反序列化會話
     * @param sessionId 會話識別碼
     * @returns 若檔案存在且有效回傳 Session 實體，否則回傳 null
     */
    public async load(sessionId: string): Promise<ISession | null> {
        const filePath = this.getFilePath(sessionId);

        try {
            const record = await this.readJson(filePath);
            if (!record) {
                return null;
            }

            const session = Session.fromJSON(record);
            this.logger.debug(`Loaded session [${sessionId}] from ${filePath}`);
            return session;
        } catch (error: any) {
            this.logger.error(`Failed to load session [${sessionId}]: ${error.message}`);
            throw error;
        }
    }

    /**
     * 刪除磁碟上指定的會話檔案
     * @param sessionId 會話識別碼
     * @returns 刪除成功回傳 true，檔案不存在回傳 false
     */
    public async delete(sessionId: string): Promise<boolean> {
        const filePath = this.getFilePath(sessionId);

        try {
            if (!existsSync(filePath)) {
                return false;
            }

            await fs.unlink(filePath);
            this.logger.debug(`Deleted session file [${sessionId}]`);
            return true;
        } catch (error: any) {
            this.logger.error(`Failed to delete session [${sessionId}]: ${error.message}`);
            throw error;
        }
    }

    /**
     * 列出儲存目錄下所有持久化的會話識別碼 (Session IDs)
     */
    public async list(): Promise<string[]> {
        try {
            if (!existsSync(this.baseDir)) {
                return [];
            }

            const entries = await fs.readdir(this.baseDir);
            const sessionIds: string[] = [];

            for (const entry of entries) {
                if (entry.endsWith('.json')) {
                    sessionIds.push(path.basename(entry, '.json'));
                }
            }

            return sessionIds;
        } catch (error: any) {
            this.logger.error(`Failed to list sessions in [${this.baseDir}]: ${error.message}`);
            return [];
        }
    }

    /**
     * 批次載入儲存庫中的所有會話實體
     * 適用於系統重啟時的會話恢復 (Session Recovery) 流程
     */
    public async loadAll(): Promise<ISession[]> {
        const sessionIds = await this.list();
        const results: ISession[] = [];

        for (const sessionId of sessionIds) {
            try {
                const session = await this.load(sessionId);
                if (session) {
                    results.push(session);
                }
            } catch (error: any) {
                this.logger.warn(`Skipping unreadable session [${sessionId}]: ${error.message}`);
            }
        }

        return results;
    }
}
