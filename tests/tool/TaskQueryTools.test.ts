import { TaskInfoTool } from '../../src/tool/core/TaskInfoTool';
import { TaskListTool } from '../../src/tool/core/TaskListTool';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { IAgentExecuteContext } from '../../src/task/types';

describe('TaskQueryTools', () => {
  let mockContext: IAgentExecuteContext;

  beforeEach(() => {
    mockContext = {
      sessionId: 's1',
      traceId: 't1',
      agentId: 'a1'
    };
  });

  it('TaskInfoTool should return task details', async () => {
    const tool = new TaskInfoTool();
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      taskManager: {
        getTaskInfo: (c: string, t: string) => ({ id: t, goal: 'g', status: 'completed', dependencies: [] })
      }
    } as any);

    const result = await tool.run({ chainId: 'c1', taskId: 't1' }, mockContext);
    expect(result.id).toBe('t1');
    expect(result.status).toBe('completed');
  });

  it('TaskListTool should list chains', async () => {
    const tool = new TaskListTool();
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      taskManager: {
        listChains: () => [{ chainId: 'c1', status: 'running', nodes: [{}, {}] }]
      }
    } as any);

    const result = await tool.run({}, mockContext);
    expect(result.totalChains).toBe(1);
    expect(result.chains[0].taskCount).toBe(2);
  });
});
