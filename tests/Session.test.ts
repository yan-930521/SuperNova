import { z } from 'zod';
import { BaseSession } from '../src/session/BaseSession';
import { TaskGraph } from '../src/session/TaskGraph';
import { ParallelScheduler } from '../src/session/ParallelScheduler';
import { MiddlewareChain } from '../src/session/MiddlewareChain';
import { ReadyQueue } from '../src/session/ReadyQueue';
import { WorkerAgent } from '../src/agent/WorkerAgent';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import { AgentRegistry } from '../src/infra/AgentRegistry';
import { FileSnapshotManager } from '../src/infra/FileSnapshotManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { IMiddleware, IMiddlewareContext } from '../interfaces/session/IMiddleware';

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
    const testStorageDir = path.join(process.cwd(), '.test-session-snapshots');

    beforeEach(async () => {
      session = new BaseSession('test-session', 'to test real execution');
      if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
        await fs.rm(testStorageDir, { recursive: true, force: true });
      }
    });

    afterEach(async () => {
      if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
        await fs.rm(testStorageDir, { recursive: true, force: true });
      }
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
      const snapshotManager = new FileSnapshotManager(testStorageDir);
      session.snapshotManager = snapshotManager;

      session.use('TOOL', {
        execute: async (ctx, next) => {
          if (ctx.target === 'task_fail') throw new Error('Task failed');
          await next();
        }
      });

      session.taskGraph.addTask('task_ok', { goal: 'ok' });
      session.taskGraph.addTask('task_fail', { goal: 'fail', dependencies: ['task_ok'] });
      session.taskGraph.addDependency('task_ok', 'task_fail');

      // 執行第一個任務並產生快照
      await session.tick();
      const firstSnapshot = await snapshotManager.getLatestSnapshotId(session.id);
      expect(firstSnapshot).toBeDefined();

      // 執行失敗任務，應觸發回滾
      try { 
        await session.tick(); 
      } catch (e) {
        // 預期會拋出錯誤
      }
      
      // 回滾後狀態應回到 task_ok 完成後的狀態，即 task_fail 就緒但未執行
      expect(session.taskGraph.getReadyTasks()).toContain('task_fail');
    });

    it('should delegate task execution to a real worker agent', async () => {
      const toolRegistry = new ToolRegistry();
      const mockTool = {
        name: 'test-tool',
        description: 'test-desc',
        safety_tier: 'TIER_1' as const,
        schema: z.any(),
        validateInput: jest.fn().mockResolvedValue(true),
        run: jest.fn().mockResolvedValue({ success: true }),
        required_capabilities: []
      };
      toolRegistry.register(mockTool);

      const agentRegistry = new AgentRegistry(undefined, toolRegistry);
      const worker = new WorkerAgent(toolRegistry, undefined as any);
      await worker.initFromJSON({ id: 'real-worker', role: 'worker' });
      agentRegistry.register(worker);

      session.agentRegistry = agentRegistry;
      session.taskGraph.addTask('task_1', { goal: 'test delegation', assignedRole: 'worker', type: 'test-tool' });

      await session.tick();

      expect(mockTool.run).toHaveBeenCalled();
      expect(mockTool.run.mock.calls[0][1].agentId).toBe('real-worker');
    });
  });

  describe('ParallelScheduler & TaskGraph', () => {
    let graph: TaskGraph;
    let queue: ReadyQueue;
    let scheduler: ParallelScheduler;

    beforeEach(() => {
      graph = new TaskGraph();
      queue = new ReadyQueue();
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
      expect(queue.getItems()).toEqual(['A']);

      scheduler.onTaskCompleted('A', graph, queue);
      expect(queue.getItems()).toContain('B');
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
