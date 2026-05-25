import { FileSystemSessionRepository } from '../../src/infra/storage/FileSystemSessionRepository';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FileSystemSessionRepository', () => {
  const testBaseDir = path.resolve('workspace/test_sessions');
  let repo: FileSystemSessionRepository;

  beforeEach(async () => {
    repo = new FileSystemSessionRepository(testBaseDir);
    await fs.mkdir(testBaseDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('should create and find a session', async () => {
    const session = await repo.create('user-1', 'My Goal');
    expect(session.userId).toBe('user-1');
    expect(session.goal).toBe('My Goal');
    const found = await repo.findById(session.id);
    expect(found?.goal).toBe('My Goal');
  });

  it('should find sessions by user id', async () => {
    await repo.create('user-1', 'Goal 1');
    await repo.create('user-1', 'Goal 2');
    await repo.create('user-2', 'Goal 3');
    const user1Sessions = await repo.findByUser('user-1');
    expect(user1Sessions).toHaveLength(2);
  });
});
