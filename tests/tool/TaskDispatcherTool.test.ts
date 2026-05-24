import { TaskDispatcherTool } from '../../src/tool/core/TaskDispatcherTool';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { IAgentExecuteContext } from '../../src/task/types';

describe('TaskDispatcherTool', () => {
  let tool: TaskDispatcherTool;
  let mockContext: IAgentExecuteContext;

  beforeEach(() => {
    tool = new TaskDispatcherTool();
    mockContext = {
      sessionId: 'test-session',
      traceId: 'test-trace',
      agentId: 'test-agent'
    };
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('task_dispatcher');
    expect(tool.safety_tier).toBe('TIER_2');
  });

  it('should submit goal to TaskManager via runtime', async () => {
    const mockSubmit = jest.fn().mockResolvedValue({ chainId: 'c1', traceId: 't1' });
    
    // Mock GlobalRuntime.getInstance()
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      taskManager: {
        submit: mockSubmit
      }
    } as any);

    const input = { goal: 'test goal' };
    const result = await tool.run(input, mockContext);

    expect(mockSubmit).toHaveBeenCalledWith('test goal', 'test-session', 'test-agent');
    expect(result).toEqual({
      message: "Goal submitted successfully. Planning initiated.",
      chainId: 'c1',
      traceId: 't1'
    });
  });
});
