import { AgentRegistry } from '../../src/infra/AgentRegistry';
import { BaseAgent } from '../../src/agent/BaseAgent';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  test('should register and retrieve an agent', async () => {
    const agent = new BaseAgent();
    // Use initFromJSON to set up the agent as it's the standard way in SuperNova
    const config = { id: 'test-agent', role: 'tester' };
    await agent.initFromJSON(config);

    registry.register(agent);
    expect(registry.getAgent('test-agent')).toBe(agent);
  });

  test('should return undefined for non-existent agent', () => {
    expect(registry.getAgent('non-existent')).toBeUndefined();
  });

  test('should load and register a BaseAgent from JSON', async () => {
    const agentJson = {
      id: 'json-agent',
      role: 'json-tester',
      type: 'BASE'
    };

    const agent = await registry.loadAgentFromJSON(agentJson);
    
    expect(agent).toBeDefined();
    expect(agent.id).toBe('json-agent');
    expect(agent.role).toBe('json-tester');
    expect(registry.getAgent('json-agent')).toBe(agent);
  });

  test('should throw error for unknown agent type', async () => {
    const agentJson = {
      id: 'unknown-agent',
      type: 'UNKNOWN'
    };

    await expect(registry.loadAgentFromJSON(agentJson)).rejects.toThrow('Unknown agent type: UNKNOWN');
  });
});
