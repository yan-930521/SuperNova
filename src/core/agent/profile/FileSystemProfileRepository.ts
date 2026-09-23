import { existsSync } from 'fs';
import * as path from 'path';

import { BaseJsonRepository } from '@supernova/storage';

import { DEFAULT_STORAGE_CONFIG, StorageConfig } from '../../config';
import { AgentProfile } from './types';

/**
 * FileSystemProfileRepository 配置選項
 */
export interface FileSystemProfileRepositoryOptions {
    /** 儲存設定規格 */
    storage?: StorageConfig;
    /** 覆寫基礎根目錄 */
    baseDir?: string;
}

/**
 * 代理人人設與身份檔案系統儲存庫 (FileSystemProfileRepository)
 * 繼承 packages/storage 的 BaseJsonRepository<AgentProfile> 基礎設施
 * 負責將 Agent 自身在會話沙盒中的人設資料 (profile.json) 進行原子化 JSON 讀寫
 * 路徑規範：
 * - 會話沙盒：{base_dir}/{session_dir}/{sessionId}/{agent_dir}/{agentId}/profile.json
 * - 全域實例：{base_dir}/{agent_dir}/{agentId}/profile.json
 */
export class FileSystemProfileRepository extends BaseJsonRepository<AgentProfile> {
    private readonly rootDir: string;
    private readonly sessionDir: string;
    private readonly agentDir: string;

    constructor(options: FileSystemProfileRepositoryOptions = {}) {
        const rootDir = options.baseDir ?? options.storage?.base_dir ?? DEFAULT_STORAGE_CONFIG.base_dir;
        const sessionDir = options.storage?.session_dir ?? DEFAULT_STORAGE_CONFIG.session_dir;
        const agentDir = options.storage?.agent_dir ?? DEFAULT_STORAGE_CONFIG.agent_dir;

        const resolvedRootDir = path.resolve(rootDir);
        super(resolvedRootDir);

        this.rootDir = resolvedRootDir;
        this.sessionDir = sessionDir;
        this.agentDir = agentDir;
    }

    /**
     * 取得特定 Agent 在會話或全域沙盒中的 profile.json 檔案路徑
     * @param agentId 代理人唯一識別碼
     * @param sessionId 所屬會話識別碼 (可選)
     */
    public getFilePath(agentId: string, sessionId?: string): string {
        if (sessionId) {
            return path.join(
                this.rootDir,
                this.sessionDir,
                sessionId,
                this.agentDir,
                agentId,
                'profile.json'
            );
        }
        return path.join(this.rootDir, this.agentDir, agentId, 'profile.json');
    }

    /**
     * 將 Agent Profile 儲存至專屬目錄
     * @param agentId 代理人識別碼
     * @param profile 身份設定資料
     * @param sessionId 所屬會話 ID (可選)
     * @returns 實際寫入之檔案路徑
     */
    public async save(agentId: string, profile: AgentProfile, sessionId?: string): Promise<string> {
        const filePath = this.getFilePath(agentId, sessionId);
        await this.writeJson(filePath, profile);
        return filePath;
    }

    /**
     * 自專屬目錄讀取 Agent Profile
     * @param agentId 代理人識別碼
     * @param sessionId 所屬會話 ID (可選)
     * @returns 讀取成功回傳 AgentProfile，不存在或解析失敗回傳 null
     */
    public async load(agentId: string, sessionId?: string): Promise<AgentProfile | null> {
        const filePath = this.getFilePath(agentId, sessionId);
        return await this.readJson(filePath);
    }

    /**
     * 檢查特定 Agent 的 Profile 檔案是否存在於專屬目錄
     * @param agentId 代理人識別碼
     * @param sessionId 所屬會話 ID (可選)
     */
    public exists(agentId: string, sessionId?: string): boolean {
        const filePath = this.getFilePath(agentId, sessionId);
        return existsSync(filePath);
    }
}
