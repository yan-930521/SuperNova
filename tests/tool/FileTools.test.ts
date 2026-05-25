import * as fs from 'fs/promises';
import * as path from 'path';

import { IAgentExecuteContext } from '../../src/infra/types/agent';
import { ReadFileTool } from '../../src/tool/file/ReadFileTool';
import { WriteFileTool } from '../../src/tool/file/WriteFileTool';

describe('FileTools', () => {
  let mockContext: IAgentExecuteContext;
  const testFile = 'workspace/test.txt';

  beforeEach(() => {
    mockContext = {
      sessionId: 'test-session',
      traceId: 'test-trace',
      agentId: 'test-agent'
    };
  });

  afterAll(async () => {
    try {
      await fs.unlink(path.resolve(testFile));
    } catch (e) {}
  });

  it('WriteFileTool should write content within workspace', async () => {
    const tool = new WriteFileTool();
    // 現在不需加 workspace/，系統會自動補上
    const result = await tool.run({ path: 'test.txt', content: 'hello' }, mockContext);
    
    expect(result).toContain('SUCCESS');
    const savedContent = await fs.readFile(path.resolve('workspace/test.txt'), 'utf-8');
    expect(savedContent).toBe('hello');
  });

  it('ReadFileTool should read content', async () => {
    const tool = new ReadFileTool();
    const content = await tool.run({ path: 'test.txt' }, mockContext);
    expect(content).toBe('hello');
  });

  it('should throw error if escaping sandbox via traversal', async () => {
    const tool = new WriteFileTool();
    // 試圖透過 ../ 逃逸
    await expect(tool.run({ path: '../../outside.txt', content: 'bad' }, mockContext))
      .rejects.toThrow('Access denied');
  });
});
