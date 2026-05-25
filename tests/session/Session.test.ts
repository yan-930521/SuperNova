import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { Session } from '../../src/models/Session';
import { EventBus } from '../../src/infra/EventBus';
import { MessageRole } from '../../src/task/types';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { SystemEventType } from '../../src/infra/types/events';

describe('Session', () => {
  let session: Session;
  let eventBus: EventBus;
  const sessionId = 'test-session-id';
  const goal = 'Test overall goal';

  beforeEach(() => {
    eventBus = new EventBus();
    // Mock GlobalRuntime.getInstance().eventBus
    jest.spyOn(GlobalRuntime, 'getInstance').mockReturnValue({ eventBus } as any);
    session = new Session(sessionId, goal, 'main-agent');
  });

  it('should initialize with id and goal', () => {
    expect(session.id).toBe(sessionId);
    expect(session.goal).toBe(goal);
    expect(session.history).toEqual([]);
  });

  it('should add messages to history manually', () => {
    session.addMessage(MessageRole.USER, 'Hello');
    expect(session.history.length).toBe(1);
    expect(session.history[0]).toBeInstanceOf(HumanMessage);
    expect(session.history[0].content).toBe('Hello');
  });

  it('should listen to TASK_COMPLETED events and add to history', () => {
    const summary = 'Worker did something useful';
    eventBus.publish({
      type: SystemEventType.TASK_COMPLETED,
      userId: 'user-1',
      sessionId: sessionId,
      payload: { summary, taskId: 't1' },
      timestamp: Date.now()
    });

    expect(session.history.length).toBe(1);
    expect(session.history[0]).toBeInstanceOf(AIMessage);
    expect(session.history[0].content).toContain(summary);
  });

  it('should not add TASK_COMPLETED messages from other sessions', () => {
    eventBus.publish({
      type: SystemEventType.TASK_COMPLETED,
      userId: 'user-1',
      sessionId: 'different-session-id',
      payload: { summary: 'Other session summary', taskId: 't2' },
      timestamp: Date.now()
    });

    expect(session.history.length).toBe(0);
  });
});
