import { fs as virtualFs } from 'memfs';
import * as path from 'path';

import { LogManager } from '../../LogManager';
import { IStorageDriver } from '../IStorageDriver';
import { WorkspaceType } from '../IWorkspaceManager';

/**
 * 記憶體虛擬檔案系統 (VOLATILE) 儲存驅動器
 * 完全活在記憶體中，Session 或 Agent 銷毀即消失。
 * 用於高頻率、無須存檔的草稿任務 (Draft Tasks)。
 */
export class MemoryVfsStorageDriver implements IStorageDriver {
  public readonly supportsCommandExecution = false;
  private activePaths: Map<string, string> = new Map();

  /**
   * 初始化虛擬工作區目錄
   */
  public async init(sessionId: string, agentId: string, type: WorkspaceType): Promise<string> {
    if (type !== 'VOLATILE') {
      throw new Error(`[MemoryVfsStorageDriver] Unsupported workspace type: ${type}`);
    }

    const key = this.getKey(sessionId, agentId);
    if (this.activePaths.has(key)) {
      return this.activePaths.get(key)!;
    }

    const wsPath = `/vfs/supernova/${sessionId}/${agentId}`;
    await virtualFs.promises.mkdir(wsPath, { recursive: true });
    this.activePaths.set(key, wsPath);
    return wsPath;
  }

  /**
   * 寫入虛擬檔案
   */
  public async writeFile(sessionId: string, agentId: string, relativePath: string, content: string): Promise<void> {
    const basePath = this.getRequiredPath(sessionId, agentId);
    const fullPath = path.join(basePath, relativePath);
    const dir = path.dirname(fullPath);

    await virtualFs.promises.mkdir(dir, { recursive: true });
    await virtualFs.promises.writeFile(fullPath, content, {
        encoding: 'utf-8'
    });
  }

  /**
   * 讀取虛擬檔案
   */
  public async readFile(sessionId: string, agentId: string, relativePath: string): Promise<string> {
    const basePath = this.getRequiredPath(sessionId, agentId);
    const fullPath = path.join(basePath, relativePath);
    return virtualFs.promises.readFile(fullPath, 'utf-8') as Promise<string>;
  }

  /**
   * 列出虛擬目錄檔案
   */
  public async listFiles(sessionId: string, agentId: string, relativePath: string = ''): Promise<string[]> {
    const basePath = this.getRequiredPath(sessionId, agentId);
    const fullPath = path.join(basePath, relativePath);

    try {
      const files = await virtualFs.promises.readdir(fullPath);
      return files as string[];
    } catch (error: any) {
      throw new Error(`[MemoryVfsStorageDriver] Failed to list VFS files in ${relativePath} for ${agentId}: ${error.message}`);
    }
  }

  /**
   * 虛擬環境下不支援命令執行
   */
  public async executeCommand(
    sessionId: string,
    agentId: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    throw new Error(`[MemoryVfsStorageDriver] Command execution (runBash) is not supported in VOLATILE (Memory VFS) mode for ${agentId}.`);
  }

  /**
   * 虛擬快照提交
   */
  public async commit(sessionId: string, agentId: string, message: string): Promise<void> {
    LogManager.recorder.info(`[MemoryVfsStorageDriver] VFS commit bypassed for ${agentId}: ${message}`);
  }

  /**
   * 虛擬變更合併
   */
  public async merge(sessionId: string, agentId: string): Promise<{ success: boolean; conflictDetails?: string }> {
    return { success: true };
  }

  /**
   * 從 memfs 中刪除虛擬目錄
   */
  public async destroy(sessionId: string, agentId: string): Promise<void> {
    const key = this.getKey(sessionId, agentId);
    const basePath = this.activePaths.get(key);
    if (!basePath) return;

    try {
      await virtualFs.promises.rm(basePath, { recursive: true, force: true });
    } catch (error: any) {
      throw new Error(`[MemoryVfsStorageDriver] Failed to destroy VFS directory for ${agentId}: ${error.message}`);
    } finally {
      this.activePaths.delete(key);
    }
  }

  /**
   * 輔助方法：生成對照表金鑰
   */
  private getKey(sessionId: string, agentId: string): string {
    return `${sessionId}:${agentId}`;
  }

  /**
   * 獲取已註冊的虛擬路徑
   */
  private getRequiredPath(sessionId: string, agentId: string): string {
    const key = this.getKey(sessionId, agentId);
    const wsPath = this.activePaths.get(key);
    if (!wsPath) {
      throw new Error(`[MemoryVfsStorageDriver] VFS path for ${agentId} in session ${sessionId} not initialized.`);
    }
    return wsPath;
  }
}
