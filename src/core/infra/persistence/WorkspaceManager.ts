import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';

import { BaseTool } from '../../agent/tool/BaseTool';
import {
    ListFilesTool, ReadBlobTool, ReadFileTool, RunBashTool, WriteFileTool
} from '../../agent/tool/WorkspaceTools';
import { Config } from '../../config/Config';
import { ILifecycle } from '../../lifecycle/ILifecycle';
import { IStorageDriver } from './IStorageDriver';
import { IWorkspaceManager, WorkspaceType } from './IWorkspaceManager';
import { GitLocalStorageDriver } from './storagedriver/GitLocalStorageDriver';
import { MemoryVfsStorageDriver } from './storagedriver/MemoryVfsStorageDriver';

/**
 * 工作空間管理器 (WorkspaceManager) - 純邏輯控制面
 * 負責 Session 工作區生命週期協調。不直接進行檔案 I/O，
 * 而是根據工作空間的類型 (VOLATILE / PERSISTENT) 動態加載對應的 StorageDriver，
 * 將所有檔案讀寫與指令執行委託給底層的驅動者。
 */
export class WorkspaceManager implements IWorkspaceManager, ILifecycle {
    // 每個 Agent 綁定自己的儲存驅動器實例，Key 為 agentId
    private activeDrivers: Map<string, IStorageDriver> = new Map();

    constructor(
        private readonly config: Config,
        private readonly basePersistentPath: string
    ) { }

    /**
     * 初始化組件 (ILifecycle)
     */
    public async initialize(): Promise<void> { }

    /**
     * 啟動組件 (ILifecycle)
     */
    public async start(): Promise<void> { }

    /**
     * 停止組件 (ILifecycle)
     */
    public async stop(): Promise<void> {
        // 停機階段 (Graceful Shutdown)
        // 注意：絕對不能在這裡呼叫 driver.destroy()！
        // 系統停止只是將 Session 掛起 (SUSPENDED)，若是 PERSISTENT 工作區，必須保留檔案系統以便下次啟動時恢復。
        // 至於 VOLATILE 記憶體工作區，程序結束後作業系統自然會回收。
        this.activeDrivers.clear();
    }

    /**
     * 檢查該 Session 的工作空間是否存在且完整
     */
    public async hasWorkspace(sessionId: string, type: WorkspaceType): Promise<boolean> {
        if (type === 'VOLATILE') {
            return true;
        }
        const expectedWsPath = path.join(this.basePersistentPath, sessionId);
        return existsSync(expectedWsPath);
    }

    /**
     * 初始化工作區，動態載入對應儲存驅動
     * @param sessionId 會話 ID
     * @param agentId 代理/任務 ID (若為 Session 根倉庫，可與 sessionId 相同)
     * @param type 工作區類型
     */
    public async initWorkspace(
        sessionId: string,
        agentId: string = sessionId,
        type: WorkspaceType = 'PERSISTENT'
    ): Promise<string> {
        let driver = this.activeDrivers.get(agentId);

        if (!driver) {
            // 依據工作區類型，動態配置策略驅動實例 (Strategy Pattern)
            driver =
                type === 'VOLATILE'
                    ? new MemoryVfsStorageDriver()
                    : new GitLocalStorageDriver(this.basePersistentPath);
            this.activeDrivers.set(agentId, driver);
        }

        return driver.init(sessionId, agentId, type);
    }

    /**
     * 提交工作區變更 (委託給特定驅動)
     */
    public async commitChanges(sessionId: string, agentId: string, message: string): Promise<void> {
        const driver = this.getRequiredDriver(agentId);
        await driver.commit(sessionId, agentId, message);
    }

    /**
     * 合併變更 (委託給特定驅動)
     */
    public async mergeWorkspace(
        sessionId: string,
        agentId: string
    ): Promise<{ success: boolean; conflictDetails?: string; ciLogs?: string }> {
        const driver = this.getRequiredDriver(agentId);
        const result = await driver.merge(sessionId, agentId);
        return {
            success: result.success,
            conflictDetails: result.conflictDetails,
            ciLogs: ''
        };
    }

    /**
     * 銷毀工作區
     */
    public async destroyWorkspace(sessionId: string, agentId: string): Promise<void> {
        const driver = this.activeDrivers.get(agentId);
        if (!driver) return;

        try {
            await driver.destroy(sessionId, agentId);
        } finally {
            this.activeDrivers.delete(agentId);
        }
    }

    /**
     * 讀取檔案
     */
    public async readFile(sessionId: string, agentId: string, relativePath: string): Promise<string> {
        const driver = this.getRequiredDriver(agentId);
        return driver.readFile(sessionId, agentId, relativePath);
    }

    /**
     * 讀取 Session 專屬的巨型資料 Blob
     */
    public async readBlob(sessionId: string, blobId: string): Promise<string> {
        // Blob 統一存放在 session 根目錄下的 blobs 資料夾
        const blobPath = path.join(this.basePersistentPath, sessionId, this.config.storage.blob_dir, `${blobId}.txt`);
        return readFile(blobPath, 'utf-8');
    }

    /**
     * 寫入檔案
     */
    public async writeFile(sessionId: string, agentId: string, relativePath: string, content: string): Promise<void> {
        const driver = this.getRequiredDriver(agentId);
        await driver.writeFile(sessionId, agentId, relativePath, content);
    }

    /**
     * 列出檔案列表
     */
    public async listFiles(sessionId: string, agentId: string, relativePath?: string): Promise<string[]> {
        const driver = this.getRequiredDriver(agentId);
        return driver.listFiles(sessionId, agentId, relativePath);
    }

    /**
     * 執行指令
     */
    public async runBash(
        sessionId: string,
        agentId: string,
        command: string,
        options?: { timeoutMs?: number }
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        const driver = this.getRequiredDriver(agentId);
        return driver.executeCommand(sessionId, agentId, command, options);
    }

    /**
     * 內部輔助方法：獲取與 Session 綁定的儲存驅動
     */
    private getRequiredDriver(agentId: string): IStorageDriver {
        const driver = this.activeDrivers.get(agentId);
        if (!driver) {
            throw new Error(`[WorkspaceManager] Storage driver for agent ${agentId} not initialized.`);
        }
        return driver;
    }
}
