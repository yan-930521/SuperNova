import { EngineManager } from '../../src/task/EngineManager';
import { EventBus } from '../../src/infra/EventBus';

describe('EngineManager', () => {
  beforeEach(() => {
    // Reset EventBus singleton
    (EventBus as any).instance = undefined;
  });

  it('should start a TaskEngine when SESSION_START event is received', async () => {
    const manager = new EngineManager();
    const sessionId = 'session-123';
    
    EventBus.getInstance().publish({
      type: 'SESSION_START',
      session_id: sessionId,
      payload: {
        nodes: [{ id: '1', goal: 'Test task', dependencies: [] }]
      },
      timestamp: Date.now()
    });

    // Wait a tiny bit for the event handler to run and start the engine
    await new Promise(r => setTimeout(r, 5));
    
    const engine = manager.getEngine(sessionId);
    expect(engine).toBeDefined();
    // It might still be running or already completed depending on timing
    // But it definitely should have been created
    expect(engine?.sessionId).toBe(sessionId);
  });

  it('should interrupt a TaskEngine when SESSION_INTERRUPT event is received', async () => {
    const manager = new EngineManager();
    const sessionId = 'session-interrupt-test';
    
    // First start it with a few tasks to ensure it stays running long enough
    EventBus.getInstance().publish({
      type: 'SESSION_START',
      session_id: sessionId,
      payload: {
        nodes: [
          { id: '1', goal: 'Task 1', dependencies: [] },
          { id: '2', goal: 'Task 2', dependencies: ['1'] },
          { id: '3', goal: 'Task 3', dependencies: ['2'] },
          { id: '4', goal: 'Task 4', dependencies: ['3'] },
          { id: '5', goal: 'Task 5', dependencies: ['4'] }
        ]
      },
      timestamp: Date.now()
    });

    // Wait for it to start
    await new Promise(r => setTimeout(r, 5));
    const engine = manager.getEngine(sessionId);
    expect(engine?.getIsRunning()).toBe(true);

    // Then interrupt it
    EventBus.getInstance().publish({
      type: 'SESSION_INTERRUPT',
      session_id: sessionId,
      payload: { reason: 'Test interruption' },
      timestamp: Date.now()
    });

    // Wait for interrupt to take effect
    await new Promise(r => setTimeout(r, 5));
    expect(engine?.getIsRunning()).toBe(false);
  });
});
