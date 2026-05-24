import { TaskCreateTool } from '../../src/tool/core/TaskCreateTool';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { IAgentExecuteContext } from '../../src/task/types';

describe('TaskCreateTool', () => {
  let tool: TaskCreateTool;
  let mockContext: IAgentExecuteContext;

  beforeEach(() => {
    tool = new TaskCreateTool();
    mockContext = {
      sessionId: 'test-session',
      traceId: 'test-trace',
      agentId: 'test-agent'
    };
  });

  it('should create a new chain if chainId is missing', async () => {
    const mockCreateChain = jest.fn().mockReturnValue('new-chain-id');
    const mockAddTask = jest.fn();
    
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      taskManager: {
        createChain: mockCreateChain,
        addTaskToChain: mockAddTask,
        getChainStatus: () => null
      }
    } as any);

    const input = { goal: 'new task' };
    const result = await tool.run(input, mockContext);

    expect(mockCreateChain).toHaveBeenCalledWith('new task', 'test-session', 'test-agent');
    expect(mockAddTask).toHaveBeenCalled();
    expect(result.chainId).toBe('new-chain-id');
  });

  it('should add to existing chain if chainId exists', async () => {
    const mockAddTask = jest.fn();
    
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      taskManager: {
        getChainStatus: (id: string) => id === 'existing-id' ? {} : null,
        addTaskToChain: mockAddTask
      }
    } as any);

    const input = { goal: 'add task', chainId: 'existing-id' };
    const result = await tool.run(input, mockContext);

    expect(mockAddTask).toHaveBeenCalled();
    expect(result.chainId).toBe('existing-id');
  });
});
