import { describe, it, expect } from 'bun:test';
import { SessionManager } from '../SessionManager';
import { SessionState } from '../Session';
import { DEFAULT_CONFIG } from '../../config/DefaultConfig';
import { WorkspaceManager } from '../../infra/persistence/WorkspaceManager';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

describe('SessionManager Recovery and Freeze Test', () => {
  it('should suspend ACTIVE sessions on stop() and recover them on start()', async () => {
    // 為了測試隔離，修改 config 的 session_dir 指向臨時測試資料夾
    const testConfig = {
      ...DEFAULT_CONFIG,
      storage: {
        ...DEFAULT_CONFIG.storage,
        base_dir: './.dev_test_session_root',
      }
    };

    const sessionRoot = path.join(process.cwd(), testConfig.storage.base_dir, testConfig.storage.session_dir);
    const workspaceRoot = path.join(process.cwd(), '.dev_test_workspace_root');

    const wm = new WorkspaceManager(workspaceRoot, testConfig.storage.session_dir, testConfig.storage.agent_dir);
    const sm = new SessionManager(testConfig, wm);

    try {
      await sm.initialize();

      // 1. 建立兩個會話：一個 VOLATILE，一個 PERSISTENT
      const sessionVolatile = sm.createSession('agent-v', 'session-v', 'VOLATILE');
      const sessionPersistent = sm.createSession('agent-p', 'session-p', 'PERSISTENT');

      // 初始化實體 Workspace 讓 PERSISTENT 正常工作
      await wm.initWorkspace(sessionPersistent.id, sessionPersistent.id, 'PERSISTENT');

      expect(sessionVolatile.status).toBe(SessionState.ACTIVE);
      expect(sessionPersistent.status).toBe(SessionState.ACTIVE);

      // 2. 測試優雅停機：執行 stop() 凍結會話
      await sm.stop();

      // 驗證記憶體對照表已被清空，且磁碟上的 session 狀態被標記為 SUSPENDED
      expect(sm.getSession('session-v')).toBeNull();

      const sessionVData = JSON.parse(await fs.readFile(path.join(sessionRoot, 'session-v', 'session.json'), 'utf-8'));
      const sessionPData = JSON.parse(await fs.readFile(path.join(sessionRoot, 'session-p', 'session.json'), 'utf-8'));

      expect(sessionVData.status).toBe(SessionState.SUSPENDED);
      expect(sessionPData.status).toBe(SessionState.SUSPENDED);

      // 3. 測試會話恢復：執行 start() 自動還原
      const smRecovery = new SessionManager(testConfig, wm);
      await smRecovery.initialize();
      await smRecovery.start();

      const recoveredV = smRecovery.getSession('session-v');
      const recoveredP = smRecovery.getSession('session-p');

      expect(recoveredV).not.toBeNull();
      expect(recoveredP).not.toBeNull();
      expect(recoveredV!.status).toBe(SessionState.ACTIVE);
      expect(recoveredP!.status).toBe(SessionState.ACTIVE);

      // 4. 測試方案 B 容錯策略：手動刪除 PERSISTENT 的工作區目錄，並重啟
      // 刪除實體目錄，模擬損毀
      await wm.destroyWorkspace(sessionPersistent.id, sessionPersistent.id);
      
      // 停止並寫回 SUSPENDED
      await smRecovery.stop();

      const smFaultTolerance = new SessionManager(testConfig, wm);
      await smFaultTolerance.initialize();
      await smFaultTolerance.start();

      const finalV = smFaultTolerance.getSession('session-v');
      const finalP = smFaultTolerance.getSession('session-p');

      // 驗證健康會話被順利恢復，而損毀的 PERSISTENT 會話被標記為 FAILED 且跳過 (沒有加入記憶體對照表)
      expect(finalV).not.toBeNull();
      expect(finalV!.status).toBe(SessionState.ACTIVE);
      expect(finalP).toBeNull(); // 損毀了，被跳過

      // 檢查磁碟上的 session-p.json，其狀態應已被更新為 FAILED
      const finalPData = JSON.parse(await fs.readFile(path.join(sessionRoot, 'session-p', 'session.json'), 'utf-8'));
      expect(finalPData.status).toBe(SessionState.FAILED);

    } finally {
      // 5. 清理測試資料夾
      await fs.rm(testConfig.storage.base_dir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('should store and serialize agent DataBlocks in inboxBuffer', async () => {
    const testConfig = {
      ...DEFAULT_CONFIG,
      storage: {
        ...DEFAULT_CONFIG.storage,
        base_dir: './.dev_test_session_root_msg',
      }
    };

    const sm = new SessionManager(testConfig);
    await sm.initialize();

    try {
      // 1. 建立會話
      const session = sm.createSession('agent-main', 'session-msg', 'VOLATILE');

      // 2. 構造一個測試 DataBlock
      const { DataBlock } = require('../../messaging/DataBlock');
      const block = new DataBlock({
        sessionId: 'session-msg',
        senderId: 'worker-1',
        targetId: 'agent-sub',
        type: 'system',
        intent: 'TASK_SUCCESS',
        controlPayload: { result: 'OK' }
      });

      // 3. 暫存至收件箱
      session.pushToInbox('agent-sub', block);
      expect(session.getInboxSize('agent-sub')).toBe(1);

      // 4. 保存會話至磁碟
      await sm.saveSession('session-msg');

      // 5. 重新加載並驗證
      const smReload = new SessionManager(testConfig);
      await smReload.initialize();
      const loadedSession = await smReload.loadSession('session-msg');

      expect(loadedSession.getInboxSize('agent-sub')).toBe(1);
      
      // 6. 提取暫存訊息
      const poppedBlocks = loadedSession.popFromInbox('agent-sub');
      expect(poppedBlocks.length).toBe(1);
      expect(poppedBlocks[0].senderId).toBe('worker-1');
      expect(poppedBlocks[0].controlPayload.result).toBe('OK');
      expect(loadedSession.getInboxSize('agent-sub')).toBe(0);

    } finally {
      await fs.rm(testConfig.storage.base_dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
