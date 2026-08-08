import { exec } from 'child_process';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { IStorageDriver } from '../../domain/IStorageDriver';
import { WorkspaceType } from '../../domain/IWorkspaceManager';

const execAsync = promisify(exec);

/**
 * 獨立 Git 與雙層 Worktree 儲存驅動器 (GitLocalStorageDriver)
 * 負責底層物理 I/O 操作與 Git 資源管理：
 * 1. Session 級 (agentId === sessionId): 獨立執行 'git init' 初始化空白中央倉庫。
 * 2. Agent 級 (agentId !== sessionId): 在該 Session 倉庫下，使用 'git worktree' 分支出子工作區沙盒。
 * 徹底保障用戶主專案的安全與隱私，並提供多 Agent 協作的分支開發與合併。
 */
export class GitLocalStorageDriver implements IStorageDriver {
    public readonly supportsCommandExecution = true;
    private activePaths: Map<string, string> = new Map();

    constructor(private readonly basePersistentPath: string) { }

    /**
     * 初始化獨立的空 Git 倉庫或其內部的 Agent Worktree
     */
    public async init(sessionId: string, agentId: string, type: WorkspaceType): Promise<string> {
        if (type !== 'PERSISTENT') {
            throw new Error(`[GitLocalStorageDriver] Unsupported workspace type: ${type}`);
        }

        const key = this.getKey(sessionId, agentId);
        if (this.activePaths.has(key)) {
            return this.activePaths.get(key)!;
        }

        const sessionRepoPath = path.join(this.basePersistentPath, sessionId);

        if (agentId === sessionId) {
            // --- 1. 初始化 Session 根倉庫 (Session中央共享倉庫) ---
            try {
                if (!existsSync(sessionRepoPath)) {
                    await fs.mkdir(sessionRepoPath, { recursive: true });
                }

                // 檢查是否已經初始化過 Git (避免重複掛載導致 commit failed)
                if (!existsSync(path.join(sessionRepoPath, '.git'))) {
                    await execAsync(`git init -b main`, { cwd: sessionRepoPath });
                    await execAsync(`git config user.name "SuperNova Agent"`, { cwd: sessionRepoPath });
                    await execAsync(`git config user.email "agent@supernova.ai"`, { cwd: sessionRepoPath });

                    // 寫入初始佔位 commit，確保 main 分支正式存在
                    await fs.writeFile(path.join(sessionRepoPath, '.keep'), 'placeholder', 'utf-8');
                    await execAsync(`git add .keep`, { cwd: sessionRepoPath });
                    await execAsync(`git commit -m "Initial commit"`, { cwd: sessionRepoPath });
                }

                this.activePaths.set(key, sessionRepoPath);
                return sessionRepoPath;
            } catch (error: any) {
                throw new Error(`[GitLocalStorageDriver] Failed to init Session Repo for ${sessionId}: ${error.message}\nSTDOUT: ${error.stdout}\nSTDERR: ${error.stderr}`);
            }
        } else {
            // --- 2. 在 Session 倉庫下開闢 Agent 子工作區 (Git Worktree) ---
            const agentWsPath = path.join(sessionRepoPath, '.worktrees', agentId);
            const branchName = `branch_${agentId}`;
            const branch = 'main';

            try {
                // 在 Session 倉庫的相對目錄下建立 worktree
                // 從指定的 branch 切出新分支
                await execAsync(`git worktree add -b ${branchName} "${agentWsPath}" ${branch}`, { cwd: sessionRepoPath });
                this.activePaths.set(key, agentWsPath);
                return agentWsPath;
            } catch (error: any) {
                if (error.message.includes('already exists')) {
                    this.activePaths.set(key, agentWsPath);
                    return agentWsPath;
                }
                throw new Error(`[GitLocalStorageDriver] Failed to init Agent Worktree for ${agentId}: ${error.message}`);
            }
        }
    }

    /**
     * 寫入檔案至指定工作區
     */
    public async writeFile(sessionId: string, agentId: string, relativePath: string, content: string): Promise<void> {
        const basePath = this.getRequiredPath(sessionId, agentId);
        const fullPath = path.join(basePath, relativePath);
        const dir = path.dirname(fullPath);

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
    }

    /**
     * 讀取實體檔案
     */
    public async readFile(sessionId: string, agentId: string, relativePath: string): Promise<string> {
        const basePath = this.getRequiredPath(sessionId, agentId);
        const fullPath = path.join(basePath, relativePath);
        return fs.readFile(fullPath, 'utf-8');
    }

    /**
     * 列出目錄檔案
     */
    public async listFiles(sessionId: string, agentId: string, relativePath: string = ''): Promise<string[]> {
        const basePath = this.getRequiredPath(sessionId, agentId);
        const fullPath = path.join(basePath, relativePath);
        return await fs.readdir(fullPath);
    }

    /**
     * 執行實體指令，受限在對應的 Agent 工作區目錄下
     */
    public async executeCommand(
        sessionId: string,
        agentId: string,
        command: string,
        options?: { timeoutMs?: number }
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        const basePath = this.getRequiredPath(sessionId, agentId);

        try {
            const timeout = options?.timeoutMs || 30000;
            const { stdout, stderr } = await execAsync(command, {
                cwd: basePath,
                timeout
            });
            return { stdout, stderr, exitCode: 0 };
        } catch (error: any) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.code || 1
            };
        }
    }

    /**
     * 提交指定工作區變更 (如果是 Worktree 則提交在該 Worktree 分支)
     */
    public async commit(sessionId: string, agentId: string, message: string): Promise<void> {
        const basePath = this.getRequiredPath(sessionId, agentId);

        try {
            await execAsync(`git add .`, { cwd: basePath });
            await execAsync(`git commit -m "${message}"`, { cwd: basePath });
        } catch (error: any) {
            if (error.stdout?.includes('nothing to commit')) {
                return;
            }
            throw new Error(`[GitLocalStorageDriver] Commit failed in ${agentId}: ${error.message}`);
        }
    }

    /**
     * 將 Agent 的分支合併回 Session 的 main 分支
     */
    public async merge(sessionId: string, agentId: string): Promise<{ success: boolean; conflictDetails?: string }> {
        if (agentId === sessionId) {
            return { success: true };
        }

        const sessionRepoPath = path.join(this.basePersistentPath, sessionId);
        const branchName = `branch_${agentId}`;

        try {
            // 切換至 main 分支並拉取該 Agent 分支進行合併 (在 Session 倉庫主目錄執行)
            await execAsync(`git merge ${branchName} --no-edit`, { cwd: sessionRepoPath });
            return { success: true };
        } catch (error: any) {
            return {
                success: false,
                conflictDetails: error.message || `Git merge failed for ${agentId} into main.`
            };
        }
    }

    /**
     * 銷毀工作區
     */
    public async destroy(sessionId: string, agentId: string): Promise<void> {
        const key = this.getKey(sessionId, agentId);
        const basePath = this.activePaths.get(key);
        if (!basePath) return;

        const sessionRepoPath = path.join(this.basePersistentPath, sessionId);

        try {
            if (agentId === sessionId) {
                // 銷毀整個 Session 倉庫
                await fs.rm(sessionRepoPath, { recursive: true, force: true });
            } else {
                // 移除子 worktree 與其對應的暫存分支 (在母倉庫執行)
                await execAsync(`git worktree remove -f "${basePath}"`, { cwd: sessionRepoPath });
                const branchName = `branch_${agentId}`;
                await execAsync(`git branch -D ${branchName}`, { cwd: sessionRepoPath }).catch(() => { });
            }
        } catch (error: any) {
            throw new Error(`[GitLocalStorageDriver] Destroy failed for ${agentId}: ${error.message}`);
        } finally {
            this.activePaths.delete(key);
        }
    }

    /**
     * 內部輔助方法：生成對照表金鑰
     */
    private getKey(sessionId: string, agentId: string): string {
        return `${sessionId}:${agentId}`;
    }

    /**
     * 獲取已註冊的工作區實體路徑
     */
    private getRequiredPath(sessionId: string, agentId: string): string {
        const key = this.getKey(sessionId, agentId);
        const wsPath = this.activePaths.get(key);
        if (!wsPath) {
            throw new Error(`[GitLocalStorageDriver] Persistent path for ${agentId} in session ${sessionId} not initialized.`);
        }
        return wsPath;
    }
}
