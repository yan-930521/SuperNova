import { WorkerAgent } from '../../src/agent/WorkerAgent';

describe('WorkerAgent', () => {
  it('executes task and returns summary with context keys', async () => {
    const agent = new WorkerAgent('worker-1', 'Test Role');
    const taskGoal = 'do something';
    const context = { key1: 'value1', key2: 'value2' };

    const { result, summary } = await agent.execute(taskGoal, context);

    expect(result).toEqual({ status: 'success' });
    expect(summary).toContain(taskGoal);
    expect(summary).toContain('key1, key2');
  });

  it('has correct id and role', () => {
    const agent = new WorkerAgent('worker-1', 'Test Role');
    expect(agent.id).toBe('worker-1');
    expect(agent.role).toBe('Test Role');
  });
});
