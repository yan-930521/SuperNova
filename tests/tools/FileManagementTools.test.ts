import { ListFilesTool } from '../../src/tool/file/ListFilesTool';
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
});
