import { describe, it, expect } from 'bun:test';
import { DataBlock } from '../DataBlock';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

describe('DataBlock toMarkdown and toMessage Test', () => {
  it('should render system DataBlock properties into structured Markdown', () => {
    const block = new DataBlock({
      sessionId: 'session-123',
      senderId: 'worker-bash',
      targetId: 'agent-alice',
      type: 'system',
      intent: 'task_success',
      controlPayload: { exitCode: 0, stdout: 'Build OK' },
      dataPointers: [
        { type: 'FILE', uri: 'workspace/hello.ts', metadata: { size: 100 } }
      ]
    });

    const md = block.toMarkdown();

    // 驗證標題與系統包裝
    expect(md).toContain('### [EVENT: TASK_SUCCESS]');
    expect(md).toContain('* **Sender**: `worker-bash`');
    expect(md).toContain('* **Payload**:');
    expect(md).toContain('"exitCode": 0');
    expect(md).toContain('"stdout": "Build OK"');
    expect(md).toContain('* **Data Pointers**:');
    expect(md).toContain('- **FILE**: [workspace/hello.ts](workspace/hello.ts) (metadata: {"size":100})');
  });

  it('should return pure text content for non-system DataBlocks when payload is string, or JSON when payload is object', () => {
    const blockStr = new DataBlock({
      sessionId: 'session-123',
      senderId: 'user-chat',
      type: 'human',
      intent: 'chat_message',
      controlPayload: 'Hello, this is pure text!'
    });
    expect(blockStr.toMarkdown()).toBe('Hello, this is pure text!');

    const blockObj = new DataBlock({
      sessionId: 'session-123',
      senderId: 'worker-tool',
      type: 'tool',
      intent: 'run_tool',
      controlPayload: { exitCode: 0, stdout: 'Build OK' }
    });
    expect(blockObj.toMarkdown()).toBe('{"exitCode":0,"stdout":"Build OK"}');
  });

  it('should format to LangChain Message instances with correct mapping', () => {
    const blockMsg = new DataBlock({
      sessionId: 'session-123',
      senderId: 'user-chat',
      type: 'human',
      intent: 'chat_message',
      controlPayload: 'Hello'
    });

    const msg = blockMsg.toMessage();

    // 驗證是否為 LangChain HumanMessage 實例
    expect(msg instanceof HumanMessage).toBe(true);
    expect(msg.content).toBe('Hello');

    const blockSys = new DataBlock({
      sessionId: 'session-123',
      senderId: 'worker-1',
      type: 'system',
      intent: 'task_complete',
      controlPayload: { status: 'done' }
    });

    const sysMsg = blockSys.toMessage();
    expect(sysMsg instanceof SystemMessage).toBe(true);
    expect(sysMsg.content).toContain('### [EVENT: TASK_COMPLETE]');
  });
});
