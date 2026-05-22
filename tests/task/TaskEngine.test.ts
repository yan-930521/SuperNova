import { TaskEngine } from '../../src/task/TaskEngine';
import { EventBus } from '../../src/infra/EventBus';
import { TaskGraph } from '../../src/session/TaskGraph';
import { TaskStore } from '../../src/task/TaskStore';

describe('TaskEngine', () => {
  beforeEach(() => {
    // Clear EventBus singleton for clean tests if necessary, or just rely on new instances
    // Since EventBus uses a singleton, let's reset it using private property if possible
    (EventBus as any).instance = undefined;
  });

  it('initializes with sessionId, isRunning=false and required components', () => {
    const engine = new TaskEngine('session-123');
    expect(engine.sessionId).toBe('session-123');
    expect(engine.getIsRunning()).toBe(false);
  });

  it('loads graph and updates status in store to pending', () => {
    const engine = new TaskEngine('session-123');
    
    const nodes = [
      { id: 'task1', type: 'test', goal: 'Goal 1', dependencies: [] },
      { id: 'task2', type: 'test', goal: 'Goal 2', dependencies: ['task1'] }
    ];

    engine.loadGraph(nodes);

    const store: TaskStore = (engine as any).store;
    expect(store.getTask('task1')?.status).toBe('pending');
    expect(store.getTask('task2')?.status).toBe('pending');
    
    const graph: TaskGraph = (engine as any).graph;
    expect(graph.getTask('task1')).toBeDefined();
    expect(graph.getTask('task2')).toBeDefined();
  });
  
  it('TaskEngineEvents emit dispatches event to EventBus', () => {
    const engine = new TaskEngine('test-session');
    const events: any = (engine as any).events;
    
    const eventsReceived: any[] = [];
    EventBus.getInstance().subscribe('test-event', (event) => {
      eventsReceived.push(event);
    });
    
    events.emit('test-event', { foo: 'bar' });
    
    expect(eventsReceived.length).toBe(1);
    expect(eventsReceived[0].type).toBe('test-event');
    expect(eventsReceived[0].payload.foo).toBe('bar');
    expect(eventsReceived[0].session_id).toBe('test-session');
    expect(eventsReceived[0].timestamp).toBeDefined();
  });
});
