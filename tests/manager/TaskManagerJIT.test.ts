import { TaskManager } from '../../src/manager/TaskManager';
import { AgentManager } from '../../src/manager/AgentManager';
import { ITaskRepository, TaskStatus, ChainStatus } from '../../src/infra/types/task';
import { TaskDTO } from '../../src/infra/types/task';
import { TaskGraph } from '../../src/models/TaskGraph';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';

jest.mock('../../src/runtime/GlobalRuntime');

describe('TaskManager JIT Expansion', () => {
  let taskManager: TaskManager;
  let agentManager: any;
  let repo: any;
  let mockRuntime: any;

  beforeEach(() => {
    // Mock ModelRegistry and InferenceEngine
    const mockEngine = {
      withSystemPrompt: jest.fn().mockReturnThis(),
      infer: jest.fn()
    };

    const mockModelRegistry = {
      getModel: jest.fn().mockReturnValue(mockEngine)
    };

    mockRuntime = {
      modelRegistry: mockModelRegistry,
      eventBus: {
        publish: jest.fn(),
        subscribe: jest.fn()
      },
      pulseEngine: {
        watchTask: jest.fn(),
        unwatchTask: jest.fn(),
        updateHeartbeat: jest.fn()
      }
    };

    (GlobalRuntime.getInstance as jest.Mock).mockReturnValue(mockRuntime);

    agentManager = {
      getAllAgents: jest.fn().mockReturnValue([
        { id: 'agent-1', role: 'test', capabilities: ['test'] }
      ]),
      getAgent: jest.fn().mockReturnValue({
        id: 'agent-1',
        execute: jest.fn().mockResolvedValue({ status: 'completed', result: 'success' })
      })
    };

    repo = {
      save: jest.fn().mockResolvedValue(undefined),
      findBySession: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null)
    };

    taskManager = new TaskManager(agentManager as any, repo as any);
  });

  it('should expand milestones one by one', async () => {
    // Mock the planner to return specific milestones
    const mockMilestones = ['Milestone 1', 'Milestone 2'];
    (taskManager as any).planner.run = jest.fn().mockResolvedValue({
      planning: {
        milestones: mockMilestones,
        currentMilestoneIdx: 0,
        taskGraph: { nodes: [] },
        projectedContext: { info: 'test' }
      }
    });

    // Mock expansion for the first milestone
    (taskManager as any).planner.expandMilestone = jest.fn()
      .mockResolvedValueOnce({
        planning: {
          milestones: mockMilestones,
          currentMilestoneIdx: 0,
          taskGraph: {
            nodes: [
              { id: 'm1_t1', goal: 'Task 1.1', status: TaskStatus.PENDING, dependencies: [] }
            ]
          }
        }
      })
      .mockResolvedValueOnce({
        planning: {
          milestones: mockMilestones,
          currentMilestoneIdx: 1,
          taskGraph: {
            nodes: [
              { id: 'm1_t1', goal: 'Task 1.1', status: TaskStatus.COMPLETED, dependencies: [] },
              { id: 'm2_t1', goal: 'Task 2.1', status: TaskStatus.PENDING, dependencies: ['m1_t1'] }
            ]
          }
        }
      });

    const { chainId } = await taskManager.submit('Test Goal', 'session-1', 'user-1');

    // Wait for the first milestone to be processed and tasks to complete
    // We need to wait for driveExecution to finish its work
    await new Promise(resolve => setTimeout(resolve, 500));

    const status = taskManager.getChainStatus(chainId);
    expect(status?.status).toBe(ChainStatus.COMPLETED);
    expect(status?.nodes.length).toBe(2);
    expect(status?.nodes.find(n => n.id === 'm1_t1')?.status).toBe(TaskStatus.COMPLETED);
    expect(status?.nodes.find(n => n.id === 'm2_t1')?.status).toBe(TaskStatus.COMPLETED);
    
    expect((taskManager as any).planner.expandMilestone).toHaveBeenCalledTimes(2);
  });
});
