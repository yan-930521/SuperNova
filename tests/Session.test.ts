import { BaseSession } from '../src/session/BaseSession';
import { TaskGraph } from '../src/session/TaskGraph';
import { ParallelScheduler } from '../src/session/ParallelScheduler';
import { MiddlewareChain } from '../src/session/MiddlewareChain';
import { WorkerAgent } from '../src/agent/WorkerAgent';
import { CoordinatorAgent } from '../src/agent/CoordinatorAgent';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import type { IMiddleware, IMiddlewareContext } from '../interfaces/session/IMiddleware';
import type { ISnapshotManager } from '../interfaces/infra/ISnapshotManager';
import type { IReadyQueue } from '../interfaces/session/IReadyQueue';

/**
 * 輔助用 ReadyQueue 實作 (用於測試)
 */
class MockReadyQueue implements IReadyQueue {
  private queue: string[] = [];
  push(taskId: string): void { this.queue.push(taskId); }
  pop(): string | null { return this.queue.shift() || null; }
  get length(): number { return this.queue.length; }
  get items(): string[] { return [...this.queue]; }
  clear(): void { this.queue = []; }
}

describe('Session Theme Tests', () => {

  describe('BaseSession Core', () => {
    it('should allow registering middlewares to different pipelines', () => {
      const session = new BaseSession('test-session', 'to test');
      const middleware: IMiddleware = { execute: async (ctx, next) => { await next(); } };
      expect(() => session.use('TOOL', middleware)).not.toThrow();
      expect(() => session.use('MUTATION', middleware)).not.toThrow();
    });

    it('should integrate MiddlewareChain into a mock execution flow', async () => {
      const session = new BaseSession('test-session', 'to test');
      let called = false;
      session.use('TOOL', {
        execute: async (ctx, next) => {
          called = true;
          await next();
        }
      });
      const ctx: IMiddlewareContext = { session_id: session.id, target: 'test-tool', data: {} };
      // @ts-ignore
      await session.toolChain.execute(ctx, async () => {});
      expect(called).toBe(true);
    });
  });

  describe('BaseSession Execution & Delegation', () => {
    let session: BaseSession;

    beforeEach(() => {
      session = new BaseSession('test-session', 'to test real execution');
    });

    it('should execute tasks through the toolChain middleware', async () => {
      const executedTasks: string[] = [];
      session.use('TOOL', {
        execute: async (ctx, next) => {
          executedTasks.push(ctx.target);
          await next();
        }
      });

      session.taskGraph.addTask('task_1', { goal: 'test goal 1' });
      session.taskGraph.addTask('task_2', { goal: 'test goal 2', dependencies: ['task_1'] });
      session.taskGraph.addDependency('task_1', 'task_2');

      await session.tick();
      expect(executedTasks).toEqual(['task_1']);
      await session.tick();
      expect(executedTasks).toEqual(['task_1', 'task_2']);
    });

    it('should trigger rollback on task failure if SnapshotManager is present', async () => {
      const mockSnapshotManager: ISnapshotManager = {
        snapshot: jest.fn(),
        rollback: jest.fn().mockResolvedValue(undefined),
        getLatestSnapshotId: jest.fn().mockResolvedValue('last-successful-checkpoint')
      } as any;
      session.snapshotManager = mockSnapshotManager;

      session.use('TOOL', {
        execute: async (ctx, next) => {
          if (ctx.target === 'task_fail') throw new Error('Task failed');
          await next();
        }
      });

      session.taskGraph.addTask('task_fail');
      try { await session.tick(); } catch (e) {}
      expect(mockSnapshotManager.rollback).toHaveBeenCalled();
    });

    it('should delegate task execution to a real worker agent', async () => {
      const toolRegistry = new ToolRegistry();
      const mockTool = {
        name: 'test-tool',
        description: 'A test tool',
        safety_tier: 'TIER_1' as const,
        validateInput: jest.fn().mockResolvedValue(true),
        run: jest.fn().mockResolvedValue('tool-result'),
        required_capabilities: []
      };
      toolRegistry.register(mockTool);

      const worker = new WorkerAgent(toolRegistry);
      await worker.initFromJSON({ id: 'real-worker', role: 'worker' });

      const mockRegistry = {
        getAgent: jest.fn().mockReturnValue(worker),
        getAgentByRole: jest.fn().mockReturnValue(undefined)
      };

      session.agentRegistry = mockRegistry as any;
      session.taskGraph.addTask('task_1', { goal: 'test delegation', assignedRole: 'worker', type: 'test-tool' });

      await session.tick();

      expect(mockTool.run).toHaveBeenCalled();
      expect(mockTool.run.mock.calls[0][1].agentId).toBe('real-worker');
    });
  });

  describe('ParallelScheduler & TaskGraph', () => {
    let graph: TaskGraph;
    let queue: MockReadyQueue;
    let scheduler: ParallelScheduler;

    beforeEach(() => {
      graph = new TaskGraph();
      queue = new MockReadyQueue();
      scheduler = new ParallelScheduler();
    });

    test('TaskGraph basics', () => {
      graph.addTask('task1', { metadata: { data: 'test' } });
      expect(graph.getReadyTasks()).toContain('task1');
      expect(graph.getTask('task1')?.metadata?.data).toBe('test');
    });

    test('Scheduler integrates with Graph', () => {
      graph.addTask('A');
      graph.addTask('B');
      graph.addDependency('A', 'B');

      scheduler.schedule(graph, queue);
      expect(queue.items).toEqual(['A']);

      scheduler.onTaskCompleted('A', graph, queue);
      expect(queue.items).toContain('B');
    });
  });

  describe('MiddlewareChain', () => {
    test('should execute middlewares in order', async () => {
      const chain = new MiddlewareChain();
      const order: number[] = [];
      chain.use({ execute: async (ctx, next) => { order.push(1); await next(); order.push(4); } });
      chain.use({ execute: async (ctx, next) => { order.push(2); await next(); order.push(3); } });

      const ctx: IMiddlewareContext = { session_id: 's1', target: 'test', data: {} };
      await chain.execute(ctx, async () => {});
      expect(order).toEqual([1, 2, 3, 4]);
    });
  });
});
