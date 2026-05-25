import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSystemTaskRepository } from '../../src/infra/storage/FileSystemTaskRepository';
import { TaskDTO } from '../../src/infra/types/task';

describe('FileSystemTaskRepository', () => {
  let tempDir: string;
  let repository: FileSystemTaskRepository;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `supernova-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    repository = new FileSystemTaskRepository(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const mockTask: TaskDTO = {
    id: 'task-123',
    sessionId: 'sess-456',
    type: 'work',
    goal: 'Test task',
    status: 'pending',
    dependencies: [],
    metadata: {}
  };

  test('should save and find a task by id', async () => {
    await repository.save(mockTask);
    const found = await repository.findById('task-123');
    expect(found).toEqual(mockTask);
  });

  test('should return null if task not found', async () => {
    const found = await repository.findById('non-existent');
    expect(found).toBeNull();
  });

  test('should find tasks by session id', async () => {
    const task1 = { ...mockTask, id: 'task-1', sessionId: 'sess-1' };
    const task2 = { ...mockTask, id: 'task-2', sessionId: 'sess-1' };
    const task3 = { ...mockTask, id: 'task-3', sessionId: 'sess-2' };

    await repository.save(task1);
    await repository.save(task2);
    await repository.save(task3);

    const sess1Tasks = await repository.findBySession('sess-1');
    expect(sess1Tasks).toHaveLength(2);
    expect(sess1Tasks).toContainEqual(task1);
    expect(sess1Tasks).toContainEqual(task2);

    const sess2Tasks = await repository.findBySession('sess-2');
    expect(sess2Tasks).toHaveLength(1);
    expect(sess2Tasks).toContainEqual(task3);
  });
});
