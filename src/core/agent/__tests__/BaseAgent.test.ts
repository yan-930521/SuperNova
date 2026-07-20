import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../../config/Config';
import {
    FileSystemAgentStateRepository
} from '../../infra/persistence/repository/FileSystemAgentStateRepository';
import { EventBus } from '../../messaging/EventBus';
import { AgentProfile, AgentState, AgentType, BaseAgent, BaseAgentData } from '../BaseAgent';
import { IDataBlockRepository } from '../../infra/persistence/IRepository';

// 建立一個 Mock 子類別用於測試 BaseAgent
class MockTestAgent extends BaseAgent {
  public readonly type = AgentType.SUB;
  public readonly canClone = true;

  protected getModel(presetName?: string) {
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

describe('BaseAgent Memory Sharing & Serialization Test', () => {
  const eventBus = new EventBus();
  const testStorageDir = path.join(process.cwd(), '.dev_temp_agent_test');
  const mockConfig: Config = {
    storage: {
      base_dir: '.dev_temp_agent_test',
      session_dir: 'session',
      agent_dir: 'agents',
      agent_state_file: 'state.json',
      oplog_file: '.oplog.jsonl'
    },
    security: {
      max_safe_tokens: 100000
    },
    llm: {
      default_preset: 'SMART',
      presets: {
        'SMART': { modelName: 'gpt-4o' }
      }
    }
  } as any;

  const mockDataBlockRepo: IDataBlockRepository = {
    appendForAgent: async () => {},
    findByAgent: async () => [],
    saveForAgent: async () => {},
    initialize: async () => {},
    start: async () => {},
    stop: async () => {}
  };

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

    const parentAgent = new MockTestAgent(parentId, sessionId, eventBus, mockConfig, mockDataBlockRepo, {
      workspacePath
    });

    // 驗證獨立目錄定址
    expect(parentAgent.workspacePath).toBe(workspacePath);
    expect(parentAgent['oplogDir']).toContain(path.join(mockConfig.storage.base_dir, mockConfig.storage.session_dir, sessionId, mockConfig.storage.agent_dir, parentId));
  });

  it('should support clone mode with shared memory', async () => {
    const parentId = 'parent-agent';
    const cloneId = 'clone-agent';
    const sessionId = 'session-123';
    const workspacePath = path.join(testStorageDir, 'workspace-parent');

    const parentAgent = new MockTestAgent(parentId, sessionId, eventBus, mockConfig, mockDataBlockRepo, {
      workspacePath
    });

    const cloneAgent = new MockTestAgent(cloneId, sessionId, eventBus, mockConfig, mockDataBlockRepo, {
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

  it('should serialize and hydrate state without repository', () => {
    const agentId = 'agent-serialization';
    const sessionId = 'session-999';
    const workspacePath = path.join(testStorageDir, 'workspace-parent');

    const agent = new MockTestAgent(agentId, sessionId, eventBus, mockConfig, mockDataBlockRepo, {
      workspacePath
    });

    // 1. 初始狀態變更
    agent.setAgentState(AgentState.IDLE);
    agent.recordUsage(10, 20, 30);

    // 2. 導出狀態
    const data = agent.serialize();
    expect(data.id).toBe(agentId);
    expect(data.sessionId).toBe(sessionId);
    expect(data.type).toBe(AgentType.SUB);
    expect(data.canClone).toBe(true);
    expect(data.state).toBe(AgentState.IDLE);
    expect(data.usageStats.promptTokens).toBe(10);

    // 3. 建立一個新的 Agent 實例，並用 data 還原
    const restoredAgent = new MockTestAgent(agentId, sessionId, eventBus, mockConfig, mockDataBlockRepo, {
      workspacePath
    });
    restoredAgent.hydrate(data);

    expect(restoredAgent.getState()).toBe(AgentState.IDLE);
    expect(restoredAgent['usageStats'].promptTokens).toBe(10);
    expect(restoredAgent['usageStats'].completionTokens).toBe(20);
  });

  it('should manage, format and serialize AgentProfile correctly', () => {
    const agentId = 'agent-profile-test';
    const sessionId = 'session-profile';
    const agent = new MockTestAgent(agentId, sessionId, eventBus, mockConfig, mockDataBlockRepo);

    const profile: AgentProfile = {
      identity: 'TestBot',
      mission: 'Test everything',
      principles: ['Do not fail']
    };

    agent.setProfile(profile);
    expect(agent.getProfile()).toEqual(profile);

    // Test formatting (using the protected method via cast)
    const formatted = (agent as any).formatProfileToSystemPrompt();
    expect(formatted).toContain('## IDENTITY\nTestBot');
    expect(formatted).toContain('## MISSION\nTest everything');
    expect(formatted).toContain('- Do not fail');

    // Test serialization
    const data = agent.serialize();
    expect(data.profile).toEqual(profile);

    // Test hydration
    const restoredAgent = new MockTestAgent(agentId, sessionId, eventBus, mockConfig, mockDataBlockRepo);
    restoredAgent.hydrate(data);
    expect(restoredAgent.getProfile()).toEqual(profile);
  });

  it('should support AgentStateRepository save/load operations', async () => {
    const parentId = 'parent-agent-crud';
    const sessionId = 'session-888';
    const sessionBaseDir = path.join(testStorageDir, 'session');
    const stateRepo = new FileSystemAgentStateRepository(mockConfig, sessionBaseDir);

    const entity: BaseAgentData = {
      id: parentId,
      sessionId,
      type: AgentType.SUB,
      canClone: true,
      state: AgentState.IDLE,
      usageStats: { promptTokens: 10, completionTokens: 20, durationMs: 30 },
      timestamp: Date.now()
    };

    // 1. saveAgentState
    await stateRepo.saveAgentState(sessionId, parentId, entity);

    // 2. loadAgentState
    const loaded = await stateRepo.loadAgentState(sessionId, parentId);
    expect(loaded).not.toBeNull();
    expect(loaded!.state).toBe(AgentState.IDLE);
    expect(loaded!.usageStats.promptTokens).toBe(10);
  });
});
