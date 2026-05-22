import { Session } from '../../src/session/Session';
import { EventBus } from '../../src/infra/EventBus';

describe('Session', () => {
  let session: Session;
  const sessionId = 'test-session-id';
  const goal = 'Test overall goal';

  beforeEach(() => {
    session = new Session(sessionId, goal);
  });

  it('should initialize with id and goal', () => {
    expect(session.id).toBe(sessionId);
    expect(session.goal).toBe(goal);
    expect(session.history).toEqual([]);
  });

  it('should add messages to history manually', () => {
    session.addMessage('user', 'Hello');
    expect(session.history.length).toBe(1);
    expect(session.history[0]).toMatchObject({
      role: 'user',
      content: 'Hello'
    });
    expect(session.history[0].timestamp).toBeDefined();
  });

  it('should listen to ACTION_SUMMARY events and add to history', () => {
    const summary = 'Worker did something useful';
    EventBus.getInstance().publish({
      type: 'ACTION_SUMMARY',
      session_id: sessionId,
      payload: { summary },
      timestamp: Date.now()
    });

    expect(session.history.length).toBe(1);
    expect(session.history[0]).toMatchObject({
      role: 'worker',
      content: summary
    });
  });

  it('should not add ACTION_SUMMARY messages from other sessions', () => {
    EventBus.getInstance().publish({
      type: 'ACTION_SUMMARY',
      session_id: 'different-session-id',
      payload: { summary: 'Other session summary' },
      timestamp: Date.now()
    });

    expect(session.history.length).toBe(0);
  });
});
