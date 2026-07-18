import { existsSync } from 'fs';
import * as path from 'path';

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
    // 一個 Session 唯一共享一個儲存驅動器實例，Key 為 sessionId
    private activeDrivers: Map<string, IStorageDriver> = new Map();

    constructor(
        private readonly config: Config,
        private readonly basePersistentPath: string = process.cwd()
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
        // 停機時清理所有活躍驅動的資源
        // 由於 destroy 需要傳入 sessionId 與 agentId，
        // 在 stop 階段，我們可以直接移除整個 Session 根目錄 (即 agentId = sessionId)
        for (const [sessionId, driver] of this.activeDrivers.entries()) {
            try {
                await driver.destroy(sessionId, sessionId);
            } catch (e) {
                console.error(`[WorkspaceManager] Graceful shutdown error for session ${sessionId}:`, e);
            }
        }
        this.activeDrivers.clear();
    }

    /**
     * 檢查該 Session 的工作空間是否存在且完整
     */
    public async hasWorkspace(sessionId: string, type: WorkspaceType): Promise<boolean> {
        if (type === 'VOLATILE') {
            return true;
        }
        const expectedWsPath = path.join(this.basePersistentPath, 'workspace', sessionId);
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
        type: WorkspaceType = 'VOLATILE'
    ): Promise<string> {
        let driver = this.activeDrivers.get(sessionId);

        if (!driver) {
            // 依據工作區類型，動態配置策略驅動實例 (Strategy Pattern)
            driver =
                type === 'VOLATILE'
                    ? new MemoryVfsStorageDriver()
                    : new GitLocalStorageDriver(this.basePersistentPath);
            this.activeDrivers.set(sessionId, driver);
        }

        return driver.init(sessionId, agentId, type);
    }

    /**
     * 提交工作區變更 (委託給特定驅動)
     */
    public async commitChanges(sessionId: string, agentId: string, message: string): Promise<void> {
        const driver = this.getRequiredDriver(sessionId);
        await driver.commit(sessionId, agentId, message);
    }

    /**
     * 合併變更 (委託給特定驅動)
     */
    public async mergeWorkspace(
        sessionId: string,
        agentId: string
    ): Promise<{ success: boolean; conflictDetails?: string; ciLogs?: string }> {
        const driver = this.getRequiredDriver(sessionId);
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
        const driver = this.activeDrivers.get(sessionId);
        if (!driver) return;

        try {
            await driver.destroy(sessionId, agentId);
        } finally {
            // 如果銷毀的是 Session 根，則清除該驅動記錄
            if (agentId === sessionId) {
                this.activeDrivers.delete(sessionId);
            }
        }
    }

    /**
     * 讀取檔案
     */
    public async readFile(sessionId: string, agentId: string, relativePath: string): Promise<string> {
        const driver = this.getRequiredDriver(sessionId);
        return driver.readFile(sessionId, agentId, relativePath);
    }

    /**
     * 寫入檔案
     */
    public async writeFile(sessionId: string, agentId: string, relativePath: string, content: string): Promise<void> {
        const driver = this.getRequiredDriver(sessionId);
        await driver.writeFile(sessionId, agentId, relativePath, content);
    }

    /**
     * 列出檔案列表
     */
    public async listFiles(sessionId: string, agentId: string, relativePath?: string): Promise<string[]> {
        const driver = this.getRequiredDriver(sessionId);
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
        const driver = this.getRequiredDriver(sessionId);
        return driver.executeCommand(sessionId, agentId, command, options);
    }

    /**
     * 內部輔助方法：獲取與 Session 綁定的儲存驅動
     */
    private getRequiredDriver(sessionId: string): IStorageDriver {
        const driver = this.activeDrivers.get(sessionId);
        if (!driver) {
            throw new Error(`[WorkspaceManager] Storage driver for session ${sessionId} not initialized.`);
        }
        return driver;
    }
}
