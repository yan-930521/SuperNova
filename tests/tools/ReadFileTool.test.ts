import { ReadFileTool } from '../../src/tool/file/ReadFileTool';
import { IToolContext } from '../../interfaces/tool/IToolContext';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('ReadFileTool', () => {
  let tool: ReadFileTool;
  const mockContext: IToolContext = {
    sessionId: 'test-session',
    agentId: 'test-agent'
  } as any;

  beforeEach(() => {
    tool = new ReadFileTool();
  });

  test('should read a file from workspace', async () => {
    const workspaceDir = path.resolve(process.cwd(), 'workspace');
    const testFilePath = path.join(workspaceDir, 'test-read.txt');
    const content = 'Hello, SuperNova!';
    
    // 確保測試檔案存在
    await fs.writeFile(testFilePath, content);
    
    try {
      const result = await tool.run({ path: 'workspace/test-read.txt' }, mockContext);
      expect(result).toBe(content);
    } finally {
      // 清理測試檔案
      await fs.unlink(testFilePath).catch(() => {});
    }
  });

  test('should read README.md from project root', async () => {
    const result = await tool.run({ path: 'README.md' }, mockContext);
    expect(result).toContain('SuperNova');
  });

  test('should throw error for blacklisted files', async () => {
    await expect(tool.run({ path: '.env' }, mockContext)).rejects.toThrow(/Access denied/);
  });

  test('should throw error for non-existent files', async () => {
    await expect(tool.run({ path: 'workspace/non-existent-file.txt' }, mockContext)).rejects.toThrow();
  });
});
