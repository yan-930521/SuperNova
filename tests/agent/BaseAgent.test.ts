import { BaseAgent } from '../../src/agent/BaseAgent';
import { IMutationRequest } from '../../interfaces/models/IMutationRequest';

describe('BaseAgent', () => {
  let agent: BaseAgent;

  beforeEach(() => {
    agent = new BaseAgent();
  });

  test('should initialize correctly from JSON', async () => {
    const config = {
      id: 'agent-001',
      role: 'worker',
      customSetting: 'enabled',
      nest: { key: 'value' }
    };

    await agent.initFromJSON(config);

    expect(agent.id).toBe('agent-001');
    expect(agent.role).toBe('worker');
    expect(agent.toJSON()).toEqual(config);
  });

  test('should handle missing id and role in config', async () => {
    await agent.initFromJSON({});
    expect(agent.id).toBe('');
    expect(agent.role).toBe('');
  });

  test('should log when receiving a task', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    await agent.initFromJSON({ id: 'test-agent' });
    
    const task = { type: 'test-task', data: 123 };
    await agent.receiveTask(task);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[BaseAgent test-agent] Receiving task:')
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(task))
    );
    
    logSpy.mockRestore();
  });

  test('should log when proposing a mutation', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    await agent.initFromJSON({ id: 'test-agent' });

    const mutation: IMutationRequest = {
      requester_id: 'test-agent',
      target_hook: 'onMessage',
      proposed_change: { newRule: true },
      priority: 10,
      version_ref: 'v1'
    };

    await agent.proposeMutation(mutation);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[BaseAgent test-agent] Proposing mutation to onMessage')
    );

    logSpy.mockRestore();
  });
});
