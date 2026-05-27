import { TaskManager } from '../../src/manager/TaskManager';
import { AgentManager } from '../../src/manager/AgentManager';
import { ITaskRepository, TaskStatus, ChainStatus } from '../../src/infra/types/task';
import { SystemEventType } from '../../src/infra/types/events';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { PulseEngine } from '../../src/infra/PulseEngine';
import { EventBus } from '../../src/infra/EventBus';

describe('TaskManager Timeout Detection', () => {
    let taskManager: TaskManager;
    let agentManager: jest.Mocked<AgentManager>;
    let taskRepo: jest.Mocked<ITaskRepository>;
    let pulseEngine: PulseEngine;
    let eventBus: EventBus;
    let runtime: GlobalRuntime;

    beforeEach(() => {
        // Mock dependencies
        const mockAgent = {
            id: 'default-worker',
            execute: jest.fn().mockReturnValue(new Promise(() => {})) // Never resolves
        };

        agentManager = {
            getAgent: jest.fn().mockReturnValue(mockAgent),
            getAllAgents: jest.fn().mockReturnValue([mockAgent])
        } as any;
        
        taskRepo = {
            save: jest.fn().mockResolvedValue(undefined),
            findById: jest.fn(),
            findBySession: jest.fn()
        } as any;

        // Setup Runtime and Infrastructure
        eventBus = new EventBus();
        // Force singleton instance for testing
        runtime = GlobalRuntime.getInstance();
        (runtime as any).eventBus = eventBus;

        // Mock ModelRegistry to prevent errors in TaskPlanner
        const mockEngine = {
            withSystemPrompt: jest.fn().mockReturnThis(),
            infer: jest.fn()
        };
        const mockModelRegistry = {
            getModel: jest.fn().mockReturnValue(mockEngine),
            getRawModel: jest.fn().mockReturnValue({})
        };
        (runtime as any).modelRegistry = mockModelRegistry;
        
        pulseEngine = new PulseEngine(eventBus);
        (runtime as any).pulseEngine = pulseEngine;

        taskManager = new TaskManager(agentManager, taskRepo);

        jest.useFakeTimers();
    });

    afterEach(() => {
        pulseEngine.stop();
        jest.useRealTimers();
    });

    test('should mark task as FAILED when PulseEngine detects timeout', async () => {
        // ... 同步建立 chain 與 task
        const chainId = await taskManager.createChain('test goal', 'session-1', 'user-1');
        const taskId = await taskManager.addTaskToChain(chainId, {
            id: 'task-1',
            goal: 'do something',
            type: 'work'
        });

        const task = taskManager.getTaskInfo(chainId, taskId);
        expect(task).toBeDefined();
        
        // 啟動引擎
        pulseEngine.start(1000);
        
        // 2. Start watching via PulseEngine
        pulseEngine.watchTask(taskId, 30000);
        
        // Simulate task is in activeTasks
        (taskManager as any).activeTasks.set(taskId, task);

        // 3. Advance time to trigger timeout in PulseEngine
        // 前進 31 秒
        jest.advanceTimersByTime(31000);

        // 4. Verify TaskManager handled the TASK_FAILED event from PulseEngine
        // Need to wait for async event handling
        await Promise.resolve(); 

        expect(task!.status).toBe(TaskStatus.FAILED);
        expect(task!.metadata?.error).toContain('Execution timeout');
        
        const chain = taskManager.getChainStatus(chainId);
        expect(chain!.status).toBe(ChainStatus.FAILED);
    });

    test('should NOT mark task as FAILED if heartbeat updates PulseEngine', async () => {
        const chainId = await taskManager.createChain('test goal', 'session-1', 'user-1');
        const taskId = await taskManager.addTaskToChain(chainId, {
            id: 'task-2',
            goal: 'do something else',
            type: 'work'
        });

        const task = taskManager.getTaskInfo(chainId, taskId);
        
        // 啟動引擎
        pulseEngine.start(1000);
        
        pulseEngine.watchTask(taskId, 30000);
        (taskManager as any).activeTasks.set(taskId, task);

        // Advance 20s
        jest.advanceTimersByTime(20000);
        // 由於 driveExecution 會立刻執行 executeNode 並將狀態設為 RUNNING
        expect(task!.status).toBe(TaskStatus.RUNNING); 

        // Update heartbeat via event
        eventBus.publish({
            type: SystemEventType.TASK_HEARTBEAT,
            userId: 'SYSTEM',
            sessionId: 'session-1',
            payload: { taskId, agentId: 'agent-1', timestamp: Date.now() },
            timestamp: Date.now()
        });

        // Advance another 20s (total 40s from start, but 20s from last heartbeat)
        jest.advanceTimersByTime(20000);

        expect(task!.status).not.toBe(TaskStatus.FAILED);
        expect(task!.status).toBe(TaskStatus.RUNNING);
    });
});
