import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskManager } from '../TaskManager';

describe('TaskManager DAG Logic', () => {
    let taskManager: TaskManager;
    let mockEventBus: any;

    beforeEach(() => {
        mockEventBus = { subscribe: () => {}, publish: () => {} };
        taskManager = new TaskManager(mockEventBus);
    });

    it('should add independent tasks and mark them as READY immediately', () => {
        taskManager.addTasks('test-session', [
            { id: 't1', objective: 'task 1', dependencies: [] },
            { id: 't2', objective: 'task 2', dependencies: [] }
        ]);

        const readyTasks = taskManager.getReadyTasks('test-session');
        expect(readyTasks.length).toBe(2);
        expect(readyTasks.map(t => t.id)).toContain('t1');
        expect(readyTasks.map(t => t.id)).toContain('t2');
    });

    it('should correctly resolve dependencies and keep blocked tasks as PENDING', () => {
        taskManager.addTasks('test-session', [
            { id: 't1', objective: 'Fetch data', dependencies: [] },
            { id: 't2', objective: 'Process data', dependencies: ['t1'] },
            { id: 't3', objective: 'Upload data', dependencies: ['t2'] }
        ]);

        expect(taskManager.getTask('test-session', 't1')?.status).toBe('READY');
        expect(taskManager.getTask('test-session', 't2')?.status).toBe('PENDING');
        expect(taskManager.getTask('test-session', 't3')?.status).toBe('PENDING');

        taskManager.updateTaskStatus('test-session', 't1', 'COMPLETED');
        expect(taskManager.getTask('test-session', 't2')?.status).toBe('READY');
        expect(taskManager.getTask('test-session', 't3')?.status).toBe('PENDING');

        taskManager.updateTaskStatus('test-session', 't2', 'COMPLETED');
        expect(taskManager.getTask('test-session', 't3')?.status).toBe('READY');
    });

    it('should throw error when encountering circular dependencies', () => {
        expect(() => {
            taskManager.addTasks('test-session', [
                { id: 'a', objective: 'A', dependencies: ['b'] },
                { id: 'b', objective: 'B', dependencies: ['c'] },
                { id: 'c', objective: 'C', dependencies: ['a'] }
            ]);
        }).toThrow(/Cycle detected/);

        expect(taskManager.getAllTasks('test-session').length).toBe(0);
    });

    it('should trigger cascading cancellation when a parent task fails', () => {
        taskManager.addTasks('test-session', [
            { id: 't1', objective: 'Fetch', dependencies: [] },
            { id: 't2', objective: 'Process', dependencies: ['t1'] },
            { id: 't3', objective: 'Upload', dependencies: ['t2'] },
            { id: 'independent', objective: 'Safe', dependencies: [] }
        ]);

        taskManager.updateTaskStatus('test-session', 't1', 'FAILED');

        expect(taskManager.getTask('test-session', 't1')?.status).toBe('FAILED');
        expect(taskManager.getTask('test-session', 't2')?.status).toBe('CANCELED');
        expect(taskManager.getTask('test-session', 't3')?.status).toBe('CANCELED');
        expect(taskManager.getTask('test-session', 'independent')?.status).toBe('READY');
    });

    it('should throw error if task depends on non-existent task', () => {
        expect(() => {
            taskManager.addTasks('test-session', [
                { id: 't1', objective: 'Fetch', dependencies: ['ghost-task'] }
            ]);
        }).toThrow(/depends on unknown task ghost-task/);
    });
});
