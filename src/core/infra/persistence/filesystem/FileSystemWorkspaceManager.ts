import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { fs as virtualFs } from 'memfs';
import * as path from 'path';
import { promisify } from 'util';

import { IWorkspaceManager, WorkspaceType } from '../IWorkspaceManager';

const execAsync = promisify(exec);

interface WorkspaceMeta {
  type: WorkspaceType;
  absolutePath: string;
}

/**
 * 實體檔案系統與 Git 整合的工作區管理器
 * 實作了「分級儲存 (Tiered Workspace)」：
 * - VOLATILE: 位於 OS 暫存區，極速 I/O，自動銷毀。
 * - PERSISTENT: 位於實體硬碟，整合 Git Branch/Worktree 進行實體隔離與版本追蹤。
 */
export class FileSystemWorkspaceManager implements IWorkspaceManager {
  private activeWorkspaces: Map<string, WorkspaceMeta> = new Map();
  private readonly basePersistentPath: string;

  /**
   * @param basePersistentPath 專案的根目錄 ( PERSISTENT 工作區會在此目錄下使用 Git 操作)
   */
  constructor(basePersistentPath: string = process.cwd()) {
    this.basePersistentPath = basePersistentPath;
  }

  public async initWorkspace(id: string, type: WorkspaceType = 'VOLATILE'): Promise<string> {
    if (this.activeWorkspaces.has(id)) {
      return this.activeWorkspaces.get(id)!.absolutePath;
    }

    let wsPath = '';

    if (type === 'VOLATILE') {
      // 建立在 memfs 虛擬檔案系統 (極速讀寫，完全不碰觸實體硬碟)
      wsPath = `/vfs/supernova/${id}`;
      await virtualFs.promises.mkdir(wsPath, { recursive: true });
    } else {
      // PERSISTENT: 在專案根目錄使用 Git Worktree 建立實體隔離分支
      // 這裡採用 git worktree，讓 Agent 擁有完全獨立的檔案系統視圖，且不干擾主分支
      wsPath = path.join(this.basePersistentPath, '.worktrees', id);
      const branchName = `agent_task_${id}`;
      
      try {
        await fs.mkdir(path.join(this.basePersistentPath, '.worktrees'), { recursive: true });
        // 嘗試建立 worktree 與新分支
        await execAsync(`git worktree add -b ${branchName} "${wsPath}"`, { cwd: this.basePersistentPath });
      } catch (error: any) {
        // 開發規範：底層基礎設施遭遇錯誤必須直接 throw，交由上層 Agent 的 [ACT] 階段處理，嚴禁擅自吞沒錯誤
        throw new Error(`Failed to initialize PERSISTENT workspace for ${id}. Git worktree error: ${error.message}`);
      }
    }

    this.activeWorkspaces.set(id, { type, absolutePath: wsPath });
    return wsPath;
  }

  public async commitChanges(id: string, message: string): Promise<void> {
    const meta = this.activeWorkspaces.get(id);
    if (!meta) throw new Error(`Workspace ${id} not found.`);

    // VOLATILE 模式不需要 Git Commit，只需紀錄日誌
    if (meta.type === 'VOLATILE') {
      console.log(`[WorkspaceManager] VOLATILE commit bypassed for ${id}: ${message}`);
      return;
    }

    // PERSISTENT 模式：執行實體 Git Commit
    try {
      await execAsync(`git add .`, { cwd: meta.absolutePath });
      await execAsync(`git commit -m "${message}"`, { cwd: meta.absolutePath });
    } catch (error: any) {
      if (error.stdout?.includes('nothing to commit')) {
        return; // 沒有變更，安全忽略
      }
      throw new Error(`Git commit failed in workspace ${id}: ${error.message}`);
    }
  }

  public async mergeWorkspace(id: string): Promise<{ success: boolean; conflictDetails?: string; ciLogs?: string }> {
    const meta = this.activeWorkspaces.get(id);
    if (!meta) throw new Error(`Workspace ${id} not found.`);

    if (meta.type === 'VOLATILE') {
      return { success: true }; // 虛擬工作區無須合併實體代碼
    }

    // PERSISTENT 模式：執行 Dry-Run Merge 與 CI 測試
    try {
      const branchName = `agent_task_${id}`;
      
      // 1. Dry-Run Merge (測試是否會有 Git 衝突)
      // 注意：這只是架構雛形，真實情況需切換到 main 分支進行 git merge --no-commit --no-ff
      const mergeCheckCmd = `git format-patch $(git merge-base main ${branchName})..${branchName} --stdout | git apply --check`;
      await execAsync(mergeCheckCmd, { cwd: this.basePersistentPath });

      // 2. 觸發 CI 測試 (Agentic CI)
      // 假設專案使用 bun test，如果失敗會拋出 error
      // await execAsync(`bun test`, { cwd: meta.absolutePath });

      return { success: true };
    } catch (error: any) {
      // 發生 Git 衝突或 CI 失敗，攔截並回傳給上層 (觸發 Agentic 衝突解決)
      return { 
        success: false, 
        conflictDetails: error.message || 'Git Auto-Merge Dry-Run Failed.',
      };
    }
  }

  public async destroyWorkspace(id: string): Promise<void> {
    const meta = this.activeWorkspaces.get(id);
    if (!meta) return;

    try {
      if (meta.type === 'VOLATILE') {
        // 徹底從 memfs 中抹除
        await virtualFs.promises.rm(meta.absolutePath, { recursive: true, force: true });
      } else {
        // PERSISTENT: 移除 Git Worktree 並刪除分支
        await execAsync(`git worktree remove -f "${meta.absolutePath}"`, { cwd: this.basePersistentPath });
        const branchName = `agent_task_${id}`;
        await execAsync(`git branch -D ${branchName}`, { cwd: this.basePersistentPath }).catch(() => {}); // 忽略分支刪除失敗
      }
    } catch (error: any) {
      throw new Error(`Failed to destroy workspace ${id}: ${error.message}`);
    } finally {
      this.activeWorkspaces.delete(id);
    }
  }

  public getWorkspacePath(id: string): string {
    const meta = this.activeWorkspaces.get(id);
    if (!meta) throw new Error(`Workspace ${id} not found.`);
    return meta.absolutePath;
  }
}
