import { beforeEach, describe, expect, it } from 'bun:test';

import { SystemEvent } from '../../domain/IBus';
import { TaskStatus } from '../../domain/ITask';
import { EventBus } from '../../messaging/EventBus';
import { TaskManager } from '../TaskManager';

describe('Task System Integration', () => {
    let eventBus: EventBus;
    let taskManager: TaskManager;
    const sessionId = 'test-session';

    beforeEach(() => {
        eventBus = new EventBus();
        taskManager = new TaskManager(eventBus);
        taskManager.initialize(); // Register event listeners
    });

    it('should advance DAG when TaskFinished event is received', async () => {
        taskManager.addTasks(sessionId, [
            { id: 't1', objective: 'Step 1', dependencies: [] },
            { id: 't2', objective: 'Step 2', dependencies: ['t1'] }
        ]);

        // 初始狀態
        expect(taskManager.getTask(sessionId, 't1')?.status).toBe('READY');
        expect(taskManager.getTask(sessionId, 't2')?.status).toBe('PENDING');

        // 模擬 Agent 完成 t1 並發出事件
        eventBus.publish({
            type: SystemEvent.TaskFinished,
            timestamp: Date.now(),
            sessionId: sessionId,
            payload: { taskId: 't1' }
        });

        // EventBus publish 是非同步處理，但在單元測試的 mock 中或者同步處理下可能立刻生效
        // 為了確保安全，我們用 Promise 稍微讓出 event loop (如果 EventBus 內部使用 async)
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(taskManager.getTask(sessionId, 't1')?.status).toBe('COMPLETED');
        expect(taskManager.getTask(sessionId, 't2')?.status).toBe('READY');
    });

    it('should cascade cancel when TaskFailed event is received', async () => {
        taskManager.addTasks(sessionId, [
            { id: 't1', objective: 'Step 1', dependencies: [] },
            { id: 't2', objective: 'Step 2', dependencies: ['t1'] }
        ]);

        // 模擬 Agent 在 t1 失敗並發出事件
        eventBus.publish({
            type: SystemEvent.TaskFailed,
            timestamp: Date.now(),
            sessionId: sessionId,
            payload: { taskId: 't1', error: 'API Error' }
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(taskManager.getTask(sessionId, 't1')?.status).toBe('FAILED');
        expect(taskManager.getTask(sessionId, 't2')?.status).toBe('CANCELED');
    });
});
