import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../../config/Config';
import {
    FileSystemAgentStateRepository
} from '../../infra/persistence/repository/FileSystemAgentStateRepository';
import { EventBus } from '../../messaging/EventBus';
import { AgentState, BaseAgent, BaseAgentData } from '../BaseAgent';

// 建立一個 Mock 子類別用於測試 BaseAgent
class MockTestAgent extends BaseAgent {
  protected getModel() {
    return {} as any; // 單元測試中不實際呼叫 LLM
  }

  protected async processInbox(messages: any[]): Promise<void> {
    this.logger.info(`Processed messages count: ${messages.length}`);
  }

  // 暴露受保護方法與屬性用於測試
  public triggerLog(msg: string): void {
    this.logger.info(msg);
  }

  public setAgentState(newState: AgentState): void {
    this.setState(newState);
  }
}

describe('BaseAgent Memory Sharing & Clone Test with Repository Decoupling', () => {
  const eventBus = new EventBus();
  const testStorageDir = path.join(process.cwd(), '.dev_temp_agent_test');
  const mockConfig: Config = {
    storage: {
      base_dir: '.dev_temp_agent_test',
      session_dir: 'session',
      agent_dir: 'agents'
    }
  } as any;

  beforeAll(() => {
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
  });

  afterAll(() => {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  });

  it('should support independent mode with isolated directories', () => {
    const parentId = 'parent-agent';
    const sessionId = 'session-123';
    const workspacePath = path.join(testStorageDir, 'workspace-parent');

    const parentAgent = new MockTestAgent(parentId, sessionId, eventBus, mockConfig, {
      workspacePath
    });

    // 驗證獨立目錄定址與狀態 Repository 解耦
    expect(parentAgent.workspacePath).toBe(workspacePath);
    expect(parentAgent['oplogDir']).toContain(path.join(mockConfig.storage.base_dir, mockConfig.storage.session_dir, sessionId, mockConfig.storage.agent_dir, parentId));
    expect(parentAgent['stateFilePath']).toContain('state.json');
  });

  it('should support clone mode with shared memory and isolated state snapshot via Repository', async () => {
    const parentId = 'parent-agent';
    const cloneId = 'clone-agent';
    const sessionId = 'session-123';
    const workspacePath = path.join(testStorageDir, 'workspace-parent');

    const parentAgent = new MockTestAgent(parentId, sessionId, eventBus, mockConfig, {
      workspacePath
    });

    const cloneAgent = new MockTestAgent(cloneId, sessionId, eventBus, mockConfig, {
      workspacePath,
      parentAgent,
      isClone: true
    });

    // 1. 驗證分身與父級記憶物理共享路徑
    expect(cloneAgent.workspacePath).toBe(parentAgent.workspacePath); // 工作區共享
    expect(cloneAgent['oplogDir']).toBe(parentAgent['oplogDir']); // 記憶共享

    // 2. 驗證日誌共享寫入同一個實體 oplog 檔案
    parentAgent.triggerLog('Parent log entry');
    cloneAgent.triggerLog('Clone log entry');

    // 由於 LogManager 檔案寫入是非同步的，等待短暫延遲後讀取
    await new Promise(resolve => setTimeout(resolve, 100));

    const oplogFilePath = path.join(parentAgent['oplogDir'], '.oplog.jsonl');
    expect(fs.existsSync(oplogFilePath)).toBe(true);

    const content = fs.readFileSync(oplogFilePath, 'utf-8');
    expect(content).toContain('Parent log entry');
    expect(content).toContain('Clone log entry');
  });

  it('should support saveState and loadState via Decoupled AgentStateRepository', async () => {
    const parentId = 'parent-agent-repo';
    const cloneId = 'clone-agent-repo';
    const sessionId = 'session-999';
    const workspacePath = path.join(testStorageDir, 'workspace-parent');

    // 顯式宣告與注入 Repository
    const sessionBaseDir = path.join(testStorageDir, 'session');
    const stateRepo = new FileSystemAgentStateRepository(sessionBaseDir);

    const parentAgent = new MockTestAgent(parentId, sessionId, eventBus, mockConfig, {
      workspacePath,
      stateRepo
    });

    const cloneAgent = new MockTestAgent(cloneId, sessionId, eventBus, mockConfig, {
      workspacePath,
      parentAgent,
      isClone: true,
      stateRepo
    });

    // 1. 初始狀態變更並保存
    parentAgent.setAgentState(AgentState.IDLE);
    cloneAgent.setAgentState(AgentState.BUSY);

    await parentAgent.saveState();
    await cloneAgent.saveState();

    // 2. 驗證實體物理檔案已生成在 Repository 指定的位置
    const parentStateFilePath = path.join(sessionBaseDir, sessionId, 'agents', parentId, 'state.json');
    const cloneStateFilePath = path.join(sessionBaseDir, sessionId, 'agents', parentId, `state_${cloneId}.json`); // 分身位於父級資料夾下

    expect(fs.existsSync(parentStateFilePath)).toBe(true);
    expect(fs.existsSync(cloneStateFilePath)).toBe(true);

    // 3. 變更狀態並透過 loadState 還原
    parentAgent.setAgentState(AgentState.TERMINATED);
    cloneAgent.setAgentState(AgentState.TERMINATED);

    expect(parentAgent.getState()).toBe(AgentState.TERMINATED);
    expect(cloneAgent.getState()).toBe(AgentState.TERMINATED);

    await parentAgent.loadState();
    await cloneAgent.loadState();

    // 還原成功驗證
    expect(parentAgent.getState()).toBe(AgentState.IDLE);
    expect(cloneAgent.getState()).toBe(AgentState.BUSY);
  });

  it('should support generic IRepository CRUD operations via composite ID', async () => {
    const parentId = 'parent-agent-crud';
    const sessionId = 'session-888';
    const sessionBaseDir = path.join(testStorageDir, 'session');
    const stateRepo = new FileSystemAgentStateRepository(sessionBaseDir);

    const entity: BaseAgentData = {
      id: parentId,
      sessionId,
      state: AgentState.IDLE,
      usageStats: { promptTokens: 10, completionTokens: 20, durationMs: 30 },
      timestamp: Date.now()
    };

    // 1. 通用 save
    await stateRepo.save(entity);

    // 2. 通用 exists (複合 ID)
    const compositeId = `${sessionId}:${parentId}`;
    expect(await stateRepo.exists(compositeId)).toBe(true);

    // 3. 通用 load (複合 ID)
    const loaded = await stateRepo.load(compositeId);
    expect(loaded).not.toBeNull();
    expect(loaded!.state).toBe(AgentState.IDLE);
    expect(loaded!.usageStats.promptTokens).toBe(10);

    // 4. 通用 delete (複合 ID)
    await stateRepo.delete(compositeId);
    expect(await stateRepo.exists(compositeId)).toBe(false);
  });
});
