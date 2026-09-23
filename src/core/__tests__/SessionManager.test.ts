import { describe, expect, test } from 'bun:test';

import { EventBus } from '@supernova/events';
import { SessionEvent, SystemEvent } from '@supernova/events/IBus';
import { Kernel } from '@supernova/runtime';

import { Session, SessionManager, SessionState } from '../session';
import { ISession, ISessionRepository } from '../session/types';

describe('SessionManager Unit Tests', () => {
    test('should manage session lifecycle in memory pool', () => {
        const manager = new SessionManager();

        // 1. 建立會話
        const session = manager.createSession({ metadata: { name: 'Main Chat' } });
        expect(session.id.startsWith('ssn_')).toBe(true);
        expect(session.status).toBe(SessionState.ACTIVE);
        expect(manager.hasSession(session.id)).toBe(true);
        expect(manager.getSession(session.id)).toBe(session);
        expect(manager.listSessions().length).toBe(1);
        expect(manager.getActiveSessions().length).toBe(1);

        // 2. 暫停與恢復
        expect(manager.pauseSession(session.id)).toBe(true);
        expect(session.status).toBe(SessionState.PAUSED);
        expect(manager.getActiveSessions().length).toBe(0);

        expect(manager.resumeSession(session.id)).toBe(true);
        expect(session.status).toBe(SessionState.ACTIVE);
        expect(manager.getActiveSessions().length).toBe(1);

        // 3. 關閉會話
        expect(manager.closeSession(session.id, 'User logout')).toBe(true);
        expect(session.status).toBe(SessionState.CLOSED);
        expect(session.closeReason).toBe('User logout');
        expect(manager.getActiveSessions().length).toBe(0);

        // 4. 移除會話
        expect(manager.removeSession(session.id)).toBe(true);
        expect(manager.hasSession(session.id)).toBe(false);
        expect(manager.listSessions().length).toBe(0);
    });

    test('should prevent duplicate session IDs', () => {
        const manager = new SessionManager();
        manager.createSession({ id: 'custom_id_1' });

        expect(() => {
            manager.createSession({ id: 'custom_id_1' });
        }).toThrow('already exists');
    });

    test('should broadcast lifecycle events to EventBus', async () => {
        const eventBus = new EventBus();
        const manager = new SessionManager({ eventBus });

        const receivedEvents: string[] = [];

        eventBus.subscribe(SessionEvent.SessionStarted, (e) => {
            receivedEvents.push(`started:${e.payload.sessionId}`);
        });
        eventBus.subscribe(SessionEvent.SessionUpdated, (e) => {
            receivedEvents.push(`updated:${e.payload.sessionId}`);
        });
        eventBus.subscribe(SessionEvent.SessionClosed, (e) => {
            receivedEvents.push(`closed:${e.payload.sessionId}`);
        });

        const session = manager.createSession();
        manager.pauseSession(session.id);
        manager.resumeSession(session.id);
        manager.closeSession(session.id);

        // EventBus publish 為非同步 setImmediate，等待事件處理完成
        await new Promise((r) => setTimeout(r, 20));

        expect(receivedEvents).toEqual([
            `started:${session.id}`,
            `updated:${session.id}`,
            `updated:${session.id}`,
            `closed:${session.id}`,
        ]);
    });

    test('should clean up idle expired sessions', () => {
        const manager = new SessionManager();
        const activeSession = manager.createSession();
        const expiredSession = manager.createSession();

        // 人工將 expiredSession 的更新時間往前調 10 秒
        expiredSession.updatedAt = Date.now() - 10000;

        // 設定閒置門檻為 5 秒
        const cleaned = manager.cleanupExpiredSessions(5000);
        expect(cleaned).toBe(1);

        expect(expiredSession.status).toBe(SessionState.CLOSED);
        expect(expiredSession.closeReason).toBe('IDLE_TIMEOUT');
        expect(activeSession.status).toBe(SessionState.ACTIVE);
    });

    test('should integrate with optional repository for save and load', async () => {
        const storage = new Map<string, any>();
        const mockRepo: ISessionRepository = {
            save: async (session: ISession) => {
                storage.set(session.id, session.toJSON());
            },
            load: async (sessionId: string) => {
                const data = storage.get(sessionId);
                return data ? Session.fromJSON(data) : null;
            },
            delete: async (sessionId: string) => {
                return storage.delete(sessionId);
            },
            list: async () => {
                return Array.from(storage.keys());
            },
        };

        const manager = new SessionManager({ repository: mockRepo });
        const session = manager.createSession({ metadata: { role: 'architect' } });

        // 保存至儲存庫
        await manager.saveSession(session.id);
        expect(storage.has(session.id)).toBe(true);

        // 從記憶體中移除以驗證載入
        manager.removeSession(session.id);
        expect(manager.hasSession(session.id)).toBe(false);

        // 從儲存庫載入
        const loadedSession = await manager.loadSession(session.id);
        expect(loadedSession.id).toBe(session.id);
        expect(loadedSession.metadata.role).toBe('architect');
        expect(manager.hasSession(session.id)).toBe(true);
    });

    test('should integrate seamlessly into Kernel as a plugin with graceful shutdown', async () => {
        const kernel = new Kernel();
        const manager = new SessionManager();

        await kernel.use(manager);
        await kernel.boot();

        // 驗證服務註冊
        expect(kernel.hasService(manager.name)).toBe(true);
        expect(kernel.getService<SessionManager>(manager.name)).toBe(manager);

        // 建立活躍會話
        const session = manager.createSession();
        expect(session.status).toBe(SessionState.ACTIVE);

        // 內核優雅停機
        await kernel.stop();

        // 驗證優雅停機時會話被標記為 SUSPENDED 並清空活躍池
        expect(session.status).toBe(SessionState.PAUSED);
        expect(session.closeReason).toBe('SUSPENDED');
        expect(manager.listSessions().length).toBe(0);
    });

    test('should recover suspended sessions on start via repository loadAll', async () => {
        const storage = new Map<string, any>();
        const mockRepo: ISessionRepository = {
            save: async (session: ISession) => {
                storage.set(session.id, session.toJSON());
            },
            load: async (sessionId: string) => {
                const data = storage.get(sessionId);
                return data ? Session.fromJSON(data) : null;
            },
            delete: async (sessionId: string) => {
                return storage.delete(sessionId);
            },
            list: async () => {
                return Array.from(storage.keys());
            },
            loadAll: async () => {
                return Array.from(storage.values()).map((data) => Session.fromJSON(data));
            },
        };

        // 1. 先用一個 manager 建立會話並優雅停機保存至儲存庫
        const manager1 = new SessionManager({ repository: mockRepo });
        const s1 = manager1.createSession({ id: 'sess_recovery_1' });
        const sClosed = manager1.createSession({ id: 'sess_closed_1' });
        manager1.closeSession(sClosed.id, 'Finished');

        // 停機，s1 轉為 SUSPENDED 並保存，sClosed 已為 CLOSED
        await manager1.stop();
        expect(storage.get('sess_recovery_1')?.status).toBe(SessionState.PAUSED);
        expect(storage.get('sess_recovery_1')?.closeReason).toBe('SUSPENDED');

        // 2. 啟動新的 manager2，執行 start() 驗證自動恢復
        const manager2 = new SessionManager({ repository: mockRepo });
        await manager2.start();

        // 驗證 s1 被恢復為 ACTIVE，且 closeReason 被清除
        expect(manager2.hasSession('sess_recovery_1')).toBe(true);
        const recoveredS1 = manager2.getSession('sess_recovery_1');
        expect(recoveredS1?.status).toBe(SessionState.ACTIVE);
        expect(recoveredS1?.closeReason).toBeUndefined();

        // 驗證 CLOSED 的會話不會被加載至記憶體池
        expect(manager2.hasSession('sess_closed_1')).toBe(false);

        // 驗證儲存庫中的狀態也被更新為 ACTIVE
        expect(storage.get('sess_recovery_1')?.status).toBe(SessionState.ACTIVE);
        expect(storage.get('sess_recovery_1')?.closeReason).toBeUndefined();
    });
});

