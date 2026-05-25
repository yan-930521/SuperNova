import { WorkerAgent } from '../../src/agent/WorkerAgent';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { EventBus } from '../../src/infra/EventBus';
import { Session } from '../../src/models/Session';

describe('WorkerAgent', () => {
  it('executes task and returns summary', async () => {
    const agent = new WorkerAgent('worker-1');
    const taskGoal = 'do something';
    const context = { sessionId: 's1', traceId: 't1', agentId: 'worker-1' };

    // Mock GlobalRuntime and Session
    const eventBus = new EventBus();
    const session = new Session('s1', 'goal', 'main');
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({
      sessionManager: { getSession: () => session },
      modelRegistry: { getModel: () => ({ withSystemPrompt: () => ({ infer: async () => ({ content: 'done', summary: 'did it', status: 'success' }) }) }) },
      eventBus
    } as any);

    const { status, summary } = await agent.execute(taskGoal, context);

    expect(status).toBe('success');
    expect(summary).toBe('did it');
  });

  it('has correct id and role', () => {
    const agent = new WorkerAgent('worker-1');
    expect(agent.id).toBe('worker-1');
    expect(agent.role).toBe('WORKER');
  });
});
