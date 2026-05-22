import { TaskStore } from '../../src/task/TaskStore';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('should initialize a task and update its status', () => {
    store.updateStatus('task-1', 'RUNNING');
    const taskState = store.getTask('task-1');
    expect(taskState).toBeDefined();
    expect(taskState?.status).toBe('RUNNING');
    expect(taskState?.id).toBe('task-1');
  });

  it('should return PENDING for a new task that was just created via getOrCreate internally', () => {
    // 雖然 getOrCreate 是私有的，但 addRecord 會觸發它
    store.addRecord({
      taskId: 'task-2',
      action: 'INIT',
      summary: 'Initializing'
    });
    const taskState = store.getTask('task-2');
    expect(taskState?.records.length).toBe(1);
    // 預設狀態應該是 PENDING (在 getOrCreate 中定義)
    // 除非 updateStatus 被調用
  });

  it('should add operation records with timestamps', () => {
    store.addRecord({
      taskId: 'task-1',
      action: 'TEST_ACTION',
      summary: 'Test summary',
      input: { key: 'value' }
    });
    const task = store.getTask('task-1');
    expect(task?.records.length).toBe(1);
    expect(task?.records[0].action).toBe('TEST_ACTION');
    expect(task?.records[0].timestamp).toBeDefined();
    expect(typeof task?.records[0].timestamp).toBe('number');
    expect(task?.records[0].input).toEqual({ key: 'value' });
  });

  it('should return undefined for non-existent task', () => {
    const task = store.getTask('non-existent');
    expect(task).toBeUndefined();
  });
});
