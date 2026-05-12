import { BaseSession } from '../../src/session/BaseSession';
import { TaskGraph } from '../../src/session/TaskGraph';
import type { IMiddleware } from '../../interfaces/session/IMiddleware';
import type { ISnapshotManager } from '../../interfaces/infra/ISnapshotManager';

describe('BaseSession Real Execution', () => {
  let session: BaseSession;

  beforeEach(() => {
    session = new BaseSession('test-session', 'to test real execution');
  });

  it('should execute tasks through the toolChain middleware', async () => {
    const executedTasks: string[] = [];
    
    // Register a middleware to track execution
    session.use('TOOL', {
      execute: async (ctx, next) => {
        executedTasks.push(ctx.target);
        await next();
      }
    });

    // Setup tasks
    session.taskGraph.addTask('task_1', { goal: 'test goal 1' });
    session.taskGraph.addTask('task_2', { goal: 'test goal 2' });
    session.taskGraph.addDependency('task_1', 'task_2');

    // First tick should execute task_1
    await session.tick();
    expect(executedTasks).toEqual(['task_1']);

    // Second tick should execute task_2
    await session.tick();
    expect(executedTasks).toEqual(['task_1', 'task_2']);
  });

  it('should handle task failure and stop execution', async () => {
    const executedTasks: string[] = [];
    
    session.use('TOOL', {
      execute: async (ctx, next) => {
        executedTasks.push(ctx.target);
        if (ctx.target === 'task_fail') {
          throw new Error('Task failed');
        }
        await next();
      }
    });

    session.taskGraph.addTask('task_fail', { goal: 'fail' });
    session.taskGraph.addTask('task_after', { goal: 'after' });
    // task_after is NOT dependent on task_fail, but we want to see if tick stops
    
    await expect(session.tick()).rejects.toThrow('Task failed');
    expect(executedTasks).toEqual(['task_fail']);
    // task_after should not be executed in the same tick if we pop them all, 
    // OR if we execute sequentially and one fails.
  });

  it('should trigger rollback on task failure if SnapshotManager is present', async () => {
    const mockSnapshotManager: ISnapshotManager = {
      snapshot: jest.fn(),
      rollback: jest.fn().mockResolvedValue(undefined),
      getLatestSnapshotId: jest.fn().mockResolvedValue('last-successful-checkpoint')
    };
    session.snapshotManager = mockSnapshotManager;

    session.use('TOOL', {
      execute: async (ctx, next) => {
        if (ctx.target === 'task_fail') {
          throw new Error('Task failed');
        }
        await next();
      }
    });

    session.taskGraph.addTask('task_fail', { goal: 'fail' });
    
    // We expect tick to throw, and THEN check if rollback was called
    try {
      await session.tick();
    } catch (e) {
      // expected
    }

    // Since we don't have a specific checkpoint yet in this mock, 
    // we just check if it was attempted to be called or handled.
    // In real scenario, it might rollback to the last successful task's snapshot.
    expect(mockSnapshotManager.rollback).toHaveBeenCalled();
  });

  it('should delegate task execution to a worker agent from the registry', async () => {
    const mockAgent = {
      id: 'test-agent',
      role: 'worker',
      executeIntent: jest.fn().mockResolvedValue({ success: true }),
      toJSON: jest.fn(),
      initFromJSON: jest.fn(),
      receiveTask: jest.fn(),
      proposeMutation: jest.fn(),
      capabilities: []
    };

    const mockRegistry = {
      getAgent: jest.fn().mockReturnValue(mockAgent),
      registerAgent: jest.fn(),
      unregisterAgent: jest.fn(),
      getAllAgents: jest.fn(),
      getAgentsByCapability: jest.fn()
    };

    session.agentRegistry = mockRegistry as any;
    
    // Add task with assignedRole
    session.taskGraph.addTask('task_1', { 
      goal: 'test delegation',
      assignedRole: 'worker',
      type: 'test-tool'
    });

    await session.tick();

    expect(mockRegistry.getAgent).toHaveBeenCalledWith('worker');
    expect(mockAgent.executeIntent).toHaveBeenCalledWith({
      toolName: 'test-tool',
      input: expect.objectContaining({ assignedRole: 'worker' })
    });
  });
});
