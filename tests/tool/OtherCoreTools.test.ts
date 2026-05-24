import { AgentListTool } from '../../src/tool/core/AgentListTool';
import { AgentRegisterTool } from '../../src/tool/core/AgentRegisterTool';
import { DeepThinkingTool } from '../../src/tool/core/DeepThinkingTool';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { IAgentExecuteContext } from '../../src/task/types';

describe('OtherCoreTools', () => {
  let mockContext: IAgentExecuteContext;

  beforeEach(() => {
    mockContext = {
      sessionId: 's1',
      traceId: 't1',
      agentId: 'a1'
    };
  });

  it('AgentListTool should list agents from registry', async () => {
    const tool = new AgentListTool();
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      agentRegistry: {
        getAllAgents: () => [
          { id: 'agent-1', role: 'Role 1', capabilities: ['C1'] },
          { id: 'agent-2', role: 'Role 2', capabilities: ['C2'] }
        ]
      }
    } as any);

    const result = await tool.run({}, mockContext);
    expect(result.total).toBe(2);
    expect(result.agents[0].id).toBe('agent-1');
  });

  it('AgentRegisterTool should load agent by id', async () => {
    const tool = new AgentRegisterTool();
    const mockLoad = jest.fn().mockResolvedValue({ id: 'new-agent', role: 'New' });
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      agentRegistry: {
        loadAgentById: mockLoad
      }
    } as any);

    const result = await tool.run({ agentId: 'new-agent' }, mockContext);
    expect(mockLoad).toHaveBeenCalledWith('new-agent', undefined);
    expect(result.id).toBe('new-agent');
  });

  it('DeepThinkingTool should return reasoning chain', async () => {
    const tool = new DeepThinkingTool();
    const result = await tool.run({ problem: 'test problem', steps: 2 }, mockContext);
    expect(result.reasoningChain.length).toBe(2);
    expect(result.focus).toBe('test problem');
  });
});
