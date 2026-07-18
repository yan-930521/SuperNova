import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { MainAgent } from '../MainAgent';
import { SubAgent } from '../SubAgent';
import { AgentState } from '../../../core/agent/BaseAgent';
import { EventBus } from '../../../core/messaging/EventBus';
import { Config } from '../../../core/config/Config';
import { FileSystemAgentStateRepository } from '../../../core/infra/persistence/repository/FileSystemAgentStateRepository';
import { DataBlock } from '../../../core/messaging/DataBlock';

describe('MainAgent God Mode and SubAgent Lifecycle Management Test', () => {
  const eventBus = new EventBus();
  const testStorageDir = path.join(process.cwd(), '.dev_temp_main_agent_test');
  const mockConfig: Config = {
    storage: {
      base_dir: '.dev_temp_main_agent_test',
      session_dir: 'session',
      agent_dir: 'agents'
    },
    security: {
      default_tool_timeout_ms: 30000,
      allow_tier_3_tools: false,
      max_safe_tokens: 100000
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

  it('should support independent sub-agent spawning with isolated workspace and oplog directories', async () => {
    const mainId = 'main-brain';
    const subId = 'sub-worker-isolated';
    const sessionId = 'session-main-1';
    const workspacePath = path.join(testStorageDir, 'workspace-main');

    const mainAgent = new MainAgent(mainId, sessionId, eventBus, mockConfig, {
      workspacePath
    });

    // 建立獨立模式 SubAgent
    const subAgent = await mainAgent.createSubAgent(subId, { isClone: false });

    expect(mainAgent.getSubAgent(subId)).toBe(subAgent);
    expect(subAgent.workspacePath).not.toBe(mainAgent.workspacePath); // 工作區隔離
    expect(subAgent['oplogDir']).not.toBe(mainAgent['oplogDir']); // 記憶隔離
  });

  it('should support clone sub-agent spawning with memory copy context sharing but isolated path storage', async () => {
    const mainId = 'main-brain';
    const sourceId = 'sub-source';
    const cloneId = 'sub-worker-clone';
    const sessionId = 'session-main-2';
    const workspacePath = path.join(testStorageDir, 'workspace-main');

    const mainAgent = new MainAgent(mainId, sessionId, eventBus, mockConfig, {
      workspacePath
    });

    // 1. 建立一個可被 Clone 的源 Agent，並模擬大腦記憶消耗
    const sourceAgent = await mainAgent.createSubAgent(sourceId, { isClone: false });
    expect(sourceAgent.canClone).toBe(true);
    sourceAgent.recordUsage(10, 20, 5);

    // 2. 以 sourceAgent 為 parent 建立分身
    const cloneAgent = await mainAgent.createSubAgent(cloneId, {
      isClone: true,
      parentAgent: sourceAgent
    });

    expect(mainAgent.getSubAgent(cloneId)).toBe(cloneAgent);
    
    // 3. 驗證 oplogDir 與 workspacePath 實體徹底隔離
    expect(cloneAgent.workspacePath).not.toBe(sourceAgent.workspacePath);
    expect(cloneAgent['oplogDir']).not.toBe(sourceAgent['oplogDir']);

    // 4. 驗證繼承了關鍵大腦記憶上下文 (usageStats 成功拷貝)
    expect(cloneAgent['usageStats'].promptTokens).toBe(10);
    expect(cloneAgent['usageStats'].completionTokens).toBe(20);
    expect(cloneAgent['usageStats'].durationMs).toBe(5);

    // 5. 驗證安全機制：對 canClone = false 的 Agent (如 mainAgent) 克隆將會失敗拋出異常
    expect(mainAgent.canClone).toBe(false);
    expect(
      mainAgent.createSubAgent('clone-of-main', { isClone: true, parentAgent: mainAgent })
    ).rejects.toThrow('Security Violation: Parent agent main-brain does not allow cloning.');
  });

  it('should support destroySubAgent and clean up subAgents repository map', async () => {
    const mainId = 'main-brain';
    const subId = 'sub-to-destroy';
    const sessionId = 'session-main-3';
    const workspacePath = path.join(testStorageDir, 'workspace-main');

    const mainAgent = new MainAgent(mainId, sessionId, eventBus, mockConfig, {
      workspacePath
    });

    const subAgent = await mainAgent.createSubAgent(subId);
    expect(mainAgent.getSubAgent(subId)).toBe(subAgent);

    // 執行銷毀
    await mainAgent.destroySubAgent(subId);

    expect(mainAgent.getSubAgent(subId)).toBeUndefined();
    expect(subAgent.getState()).toBe(AgentState.TERMINATED); // 狀態切換為 TERMINATED
  });

  it('should wake up and processInbox when receiving DataBlock messages via EventBus', async () => {
    const mainId = 'main-brain-event';
    const sessionId = 'session-main-4';
    const workspacePath = path.join(testStorageDir, 'workspace-main');

    // 注入特化 Repository 來測試狀態存檔
    const stateRepo = new FileSystemAgentStateRepository(path.join(testStorageDir, 'session'));

    const mainAgent = new MainAgent(mainId, sessionId, eventBus, mockConfig, {
      workspacePath,
      stateRepo
    });

    // 1. 主動掛起
    await mainAgent.suspend();
    expect(mainAgent.getState()).toBe(AgentState.SUSPENDED);

    // 2. 模擬外部發送訊息到 MainAgent 的 EventBus 通道
    const msg = new DataBlock({
      sessionId,
      senderId: 'user',
      targetId: mainId,
      type: 'message',
      intent: 'test-wake-up',
      controlPayload: 'Wake up, brain!'
    });

    // 發佈事件
    eventBus.publish({
      type: mainId,
      timestamp: Date.now(),
      payload: msg,
      sessionId
    });

    // 等待事件異步傳遞
    await new Promise(resolve => setTimeout(resolve, 100));

    // 3. 驗證大腦已被喚醒，狀態自動切換為 BUSY，且成功處理了信箱
    expect(mainAgent.getState()).toBe(AgentState.BUSY);
  });
});
