import { describe, it, expect } from 'bun:test';
import { WorkspaceManager } from '../WorkspaceManager';
import { existsSync } from 'fs';
import * as path from 'path';

describe('WorkspaceManager Two-Tier Workspace Test', () => {
  it('should support VOLATILE VFS routing for session and agents', async () => {
    const wm = new WorkspaceManager();

    // 1. 初始化 Session 根
    const sessionPath = await wm.initWorkspace('session-vfs', 'session-vfs', 'VOLATILE');
    expect(sessionPath).toBe('/vfs/supernova/session-vfs/session-vfs');

    // 2. 初始化 Agent A 的子工作區
    const agentPath = await wm.initWorkspace('session-vfs', 'agent-a', 'VOLATILE');
    expect(agentPath).toBe('/vfs/supernova/session-vfs/agent-a');

    // 3. 在 Agent A 中寫檔
    await wm.writeFile('session-vfs', 'agent-a', 'src/hello.ts', 'console.log("VFS");');

    // 4. 讀取 Agent A 檔案
    const content = await wm.readFile('session-vfs', 'agent-a', 'src/hello.ts');
    expect(content).toBe('console.log("VFS");');

    // 5. 銷毀工作區
    await wm.destroyWorkspace('session-vfs', 'agent-a');
    await wm.destroyWorkspace('session-vfs', 'session-vfs');
  });

  it('should support PERSISTENT Git repository and agent worktrees', async () => {
    // 將測試臨時目錄限制在專案下的 .dev_test_repo (被 gitignore)
    const tempTestPath = path.join(process.cwd(), '.dev_test_repo');
    const wm = new WorkspaceManager(tempTestPath, 'workspace', '.worktrees');

    const sessionId = `session-${Date.now()}`;
    const agentId = 'agent-bob';

    try {
      // 1. 初始化 Session 空 Git 倉庫 (Session根)
      const sessionPath = await wm.initWorkspace(sessionId, sessionId, 'PERSISTENT');
      expect(existsSync(path.join(sessionPath, '.git'))).toBe(true);

      // 2. 在該 Session 倉庫下，為 agent-bob 開闢 worktree 子工作區
      const agentPath = await wm.initWorkspace(sessionId, agentId, 'PERSISTENT');
      expect(existsSync(path.join(agentPath, '.git'))).toBe(true); // 這是一個指向母倉庫的 .git 指針檔案

      // 3. 在 agent-bob 工作區寫入檔案並 commit 存檔
      await wm.writeFile(sessionId, agentId, 'bob_code.ts', 'const bob = 1;');
      await wm.commitChanges(sessionId, agentId, 'feat: add bob code');

      // 4. 執行指令測試 (在 agent-bob 的 worktree 沙盒中)
      const lsResult = await wm.runBash(sessionId, agentId, 'git status');
      expect(lsResult.exitCode).toBe(0);

      // 5. 將 agent-bob 分支合併回 Session 倉庫的 main 分支
      const mergeResult = await wm.mergeWorkspace(sessionId, agentId);
      expect(mergeResult.success).toBe(true);

    } finally {
      // 6. 清理並銷毀所有建立的 worktree 與 Session 倉庫
      await wm.destroyWorkspace(sessionId, agentId);
      await wm.destroyWorkspace(sessionId, sessionId);
      
      // 清理測試目錄
      const fs = require('fs/promises');
      await fs.rm(tempTestPath, { recursive: true, force: true }).catch(() => {});
    }
  });
});
