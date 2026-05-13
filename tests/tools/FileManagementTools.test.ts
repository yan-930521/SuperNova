import { ListFilesTool } from '../../src/tool/file/ListFilesTool';
import { DeleteFileTool } from '../../src/tool/file/DeleteFileTool';
import { IToolContext } from '../../interfaces/tool/IToolContext';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('ListFilesTool', () => {
  let tool: ListFilesTool;
  const mockContext: IToolContext = {
    sessionId: 'test-session',
    agentId: 'test-agent'
  } as any;

  beforeEach(() => {
    tool = new ListFilesTool();
  });

  test('should list files in workspace', async () => {
    const workspaceDir = path.resolve(process.cwd(), 'workspace');
    const testFile = path.join(workspaceDir, 'list-test.txt');
    await fs.writeFile(testFile, 'test');
    
    try {
      const result = await tool.run({ path: 'workspace' }, mockContext);
      expect(result).toContain('list-test.txt');
    } finally {
      await fs.unlink(testFile).catch(() => {});
    }
  });

  test('should throw error for blacklisted path', async () => {
    await expect(tool.run({ path: '.env' }, mockContext)).rejects.toThrow(/Access denied/);
  });
});

describe('DeleteFileTool', () => {
  let tool: DeleteFileTool;
  const mockContext: IToolContext = {
    sessionId: 'test-session',
    agentId: 'test-agent'
  } as any;

  beforeEach(() => {
    tool = new DeleteFileTool();
  });

  test('should delete a file in workspace', async () => {
    const workspaceDir = path.resolve(process.cwd(), 'workspace');
    const testFile = path.join(workspaceDir, 'delete-test.txt');
    await fs.writeFile(testFile, 'test');
    
    const result = await tool.run({ path: 'workspace/delete-test.txt' }, mockContext);
    expect(result).toContain('SUCCESS');
    
    const exists = await fs.access(testFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test('should throw error for path outside workspace', async () => {
    await expect(tool.run({ path: 'src/index.ts' }, mockContext)).rejects.toThrow(/Access denied/);
  });

  test('should throw error for blacklisted path', async () => {
    await expect(tool.run({ path: 'workspace/.env' }, mockContext)).rejects.toThrow(/Access denied/);
  });
});
