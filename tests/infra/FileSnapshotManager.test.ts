import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSnapshotManager } from '../../src/infra/FileSnapshotManager';
import { ISession } from '../../interfaces/session/ISession';

describe('FileSnapshotManager', () => {
  const testStorageDir = path.join(process.cwd(), '.test-snapshots');
  let manager: FileSnapshotManager;

  beforeEach(async () => {
    manager = new FileSnapshotManager(testStorageDir);
    if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    }
  });

  it('should create a snapshot file correctly', async () => {
    const mockSession = {
      id: 'session-1',
      toJSON: () => ({ id: 'session-1', data: 'test' }),
      loadFromJSON: async () => {}
    } as unknown as ISession;

    const snapshotId = await manager.snapshot(mockSession, { lastTaskId: 'task-1' });
    
    expect(snapshotId).toBeDefined();
    const filePath = path.join(testStorageDir, 'session-1', `${snapshotId}.json`);
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(content.session.id).toBe('session-1');
    expect(content.metadata.lastTaskId).toBe('task-1');
  });

  it('should retrieve the latest snapshot ID', async () => {
    const mockSession = {
      id: 'session-2',
      toJSON: () => ({ id: 'session-2' }),
      loadFromJSON: async () => {}
    } as unknown as ISession;

    await manager.snapshot(mockSession, { taskIndex: 1 });
    const id2 = await manager.snapshot(mockSession, { taskIndex: 2 });

    const latest = await manager.getLatestSnapshotId('session-2');
    expect(latest).toBe(id2);
  });
});
