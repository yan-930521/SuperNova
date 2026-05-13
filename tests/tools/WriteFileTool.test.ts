import * as fs from 'fs/promises';
import * as path from 'path';
import { WriteFileTool } from '../../src/tool/file/WriteFileTool';

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  const workspacePath = path.resolve(process.cwd(), 'workspace');

  beforeEach(() => {
    tool = new WriteFileTool();
  });

  afterAll(async () => {
    // 清理測試產出的檔案
    const testFile = path.join(workspacePath, 'test-write.txt');
    try { await fs.unlink(testFile); } catch {}
  });

  it('should allow writing to workspace', async () => {
    const result = await tool.run({ path: 'workspace/test-write.txt', content: 'hello supernova' });
    expect(result).toContain('SUCCESS');
    
    const content = await fs.readFile(path.join(workspacePath, 'test-write.txt'), 'utf-8');
    expect(content).toBe('hello supernova');
  });

  it('should block writing to project root', async () => {
    await expect(tool.run({ path: 'README.md', content: 'hack' }))
      .rejects.toThrow(/Access denied: Write\/Delete operation restricted to workspace/);
  });

  it('should block writing to blacklisted files', async () => {
    await expect(tool.run({ path: 'workspace/.env', content: 'SECRET=123' }))
      .rejects.toThrow(/Access denied: Path is blacklisted/);
  });
});
