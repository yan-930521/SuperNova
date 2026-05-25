import { FileSystemUserRepository } from '../../src/infra/storage/FileSystemUserRepository';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FileSystemUserRepository', () => {
  const testBaseDir = path.resolve('workspace/test_users');
  let repo: FileSystemUserRepository;

  beforeEach(async () => {
    repo = new FileSystemUserRepository(testBaseDir);
    await fs.mkdir(testBaseDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('should save and find a user', async () => {
    const user = { 
      id: 'user-1', 
      name: 'Test User', 
      preferences: {}, 
      apiKeys: {} 
    };
    await repo.save(user);
    const found = await repo.findById('user-1');
    expect(found).toEqual(user);
  });
});
