import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

import { DataBlock, MessagePriority } from '../messaging';
import { FileSystemSessionRepository, Session, SessionManager, SessionState } from '../session';

describe('FileSystemSessionRepository Unit Tests', () => {
    const testDir = path.resolve('./tmp/test_session_repo_' + Date.now());
    let repo: FileSystemSessionRepository;

    beforeAll(async () => {
        repo = new FileSystemSessionRepository({ baseDir: testDir });
    });

    afterAll(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {
            // 忽略測試目錄清理錯誤
        }
    });

    it('應能成功儲存並讀取包含收件箱訊息的 Session', async () => {
        const session = new Session({
            id: 'sess_test_1',
            metadata: { channel: 'test_channel', title: 'Persist Test' },
        });

        // 放入待處理訊息至收件箱
        const block = new DataBlock({
            sessionId: 'sess_test_1',
            senderId: 'user_1',
            type: 'human',
            controlPayload: 'Hello FileSystemSessionRepository',
            priority: MessagePriority.HIGH,
        });
        session.pushToInbox('agent_alpha', block);

        // 儲存至磁碟
        await repo.save(session);

        // 從磁碟載入
        const loaded = await repo.load('sess_test_1');
        expect(loaded).not.toBeNull();
        expect(loaded!.id).toBe('sess_test_1');
        expect(loaded!.status).toBe(SessionState.ACTIVE);
        expect(loaded!.metadata.title).toBe('Persist Test');

        // 驗證收件箱訊息還原
        expect(loaded!.hasPendingMessages('agent_alpha')).toBe(true);
        expect(loaded!.getInboxSize('agent_alpha')).toBe(1);
        const peeked = loaded!.peekInbox('agent_alpha');
        expect(peeked[0].controlPayload).toBe('Hello FileSystemSessionRepository');
        expect(peeked[0].priority).toBe(MessagePriority.HIGH);
    });

    it('載入不存在的 Session 應回傳 null', async () => {
        const result = await repo.load('non_existent_session_id');
        expect(result).toBeNull();
    });

    it('應能正確列出所有已儲存的 Session IDs', async () => {
        const s2 = new Session({ id: 'sess_test_2' });
        const s3 = new Session({ id: 'sess_test_3' });

        await repo.save(s2);
        await repo.save(s3);

        const list = await repo.list();
        expect(list).toContain('sess_test_1');
        expect(list).toContain('sess_test_2');
        expect(list).toContain('sess_test_3');
    });

    it('應能透過 loadAll 批次載入所有持久化會話', async () => {
        const allSessions = await repo.loadAll();
        expect(allSessions.length).toBeGreaterThanOrEqual(3);

        const ids = allSessions.map((s) => s.id);
        expect(ids).toContain('sess_test_1');
        expect(ids).toContain('sess_test_2');
        expect(ids).toContain('sess_test_3');
    });

    it('應能正確刪除指定的 Session 檔案', async () => {
        const existsBefore = await repo.load('sess_test_2');
        expect(existsBefore).not.toBeNull();

        const deleted = await repo.delete('sess_test_2');
        expect(deleted).toBe(true);

        const loadedAfter = await repo.load('sess_test_2');
        expect(loadedAfter).toBeNull();

        // 再次刪除已不存在的檔案應回傳 false
        const deletedAgain = await repo.delete('sess_test_2');
        expect(deletedAgain).toBe(false);
    });

    it('應能與 SessionManager 完美集成', async () => {
        const manager = new SessionManager({ repository: repo });

        // 由 SessionManager 建立 Session
        const session = manager.createSession({
            id: 'sess_managed_1',
            metadata: { owner: 'integration_test' },
        });

        // 透過 SessionManager 手動儲存
        await manager.saveSession('sess_managed_1');

        // 從管理器記憶體池移除
        manager.removeSession('sess_managed_1');
        expect(manager.hasSession('sess_managed_1')).toBe(false);

        // 透過 SessionManager 從 repository 重新載入
        const restored = await manager.loadSession('sess_managed_1');
        expect(restored.id).toBe('sess_managed_1');
        expect(restored.metadata.owner).toBe('integration_test');
        expect(manager.hasSession('sess_managed_1')).toBe(true);
    });
});
