import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSystemSessionRepository } from '../FileSystemSessionRepository';
import { FileSystemDataBlockRepository } from '../FileSystemDataBlockRepository';
import { Session, SessionState } from '../../../../session/Session';
import { DataBlock } from '../../../../messaging/DataBlock';
import { DEFAULT_CONFIG } from '../../../../config/DefaultConfig';

describe('FileSystem Repositories Test', () => {
  const tempWorkspaceRoot = path.join(process.cwd(), '.dev_temp_repo_test');

  beforeAll(async () => {
    await fs.mkdir(tempWorkspaceRoot, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempWorkspaceRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('should support Session CRUD operations via FileSystemSessionRepository', async () => {
    const repo = new FileSystemSessionRepository(DEFAULT_CONFIG, path.join(tempWorkspaceRoot, 'workspace', 'session'));
    await repo.initialize();

    const session = new Session({
      id: 'session-repo-test-1',
      mainAgentId: 'agent-main',
      status: SessionState.ACTIVE,
      metadata: { debug: true }
    });

    // 1. 測試 save & exists
    await repo.save(session);
    expect(await repo.exists('session-repo-test-1')).toBe(true);

    // 2. 測試 load
    const loaded = await repo.load('session-repo-test-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('session-repo-test-1');
    expect(loaded!.mainAgentId).toBe('agent-main');
    expect(loaded!.status).toBe(SessionState.ACTIVE);
    expect(loaded!.metadata.debug).toBe(true);

    // 3. 測試 list
    const list = await repo.list();
    expect(list).toContain('session-repo-test-1');

    // 4. 測試 delete
    await repo.delete('session-repo-test-1');
    expect(await repo.exists('session-repo-test-1')).toBe(false);
  });

  it('should support DataBlock append/save/find via FileSystemDataBlockRepository', async () => {
    const repo = new FileSystemDataBlockRepository(DEFAULT_CONFIG, path.join(tempWorkspaceRoot, 'workspace', 'session'));
    const sessionId = 'session-repo-test-2';
    const agentId = 'agent-alice';

    // 1. 測試 appendForAgent (追加三條 JSONL)
    const block1 = new DataBlock({
      sessionId,
      senderId: 'worker-1',
      targetId: agentId,
      type: 'system',
      intent: 'start',
      controlPayload: { step: 1 }
    });
    const block2 = new DataBlock({
      sessionId,
        senderId: 'agent-1',
        targetId: 'agent-2',
        type: 'human',
        intent: 'TEST',
      controlPayload: 'Hello'
    });

    await repo.appendForAgent(sessionId, agentId, block1);
    await repo.appendForAgent(sessionId, agentId, block2);

    // 2. 測試 findByAgent (讀回並反序列化驗證)
    const history = await repo.findByAgent(sessionId, agentId);
    expect(history.length).toBe(2);
    expect(history[0].id).toBe(block1.id);
    expect(history[0].intent).toBe('start');
    expect(history[1].id).toBe(block2.id);
    expect(history[1].type).toBe('human');
    expect(history[1].toMarkdown()).toBe('Hello'); // 驗證 toMarkdown 與 type=message

    // 3. 測試 saveForAgent (整份覆寫)
    const block3 = new DataBlock({
      sessionId,
      senderId: 'worker-3',
      targetId: agentId,
      type: 'system',
      intent: 'finish',
      controlPayload: { step: 3 }
    });

    // 覆寫為只有 block3 的歷史
    await repo.saveForAgent(sessionId, agentId, [block3]);

    const finalHistory = await repo.findByAgent(sessionId, agentId);
    expect(finalHistory.length).toBe(1);
    expect(finalHistory[0].id).toBe(block3.id);
    expect(finalHistory[0].intent).toBe('finish');
  });
});
