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

  it('should support clone sub-agent spawning with shared workspace, oplog directories and states', async () => {
    const mainId = 'main-brain';
    const cloneId = 'sub-worker-clone';
    const sessionId = 'session-main-2';
    const workspacePath = path.join(testStorageDir, 'workspace-main');

    const mainAgent = new MainAgent(mainId, sessionId, eventBus, mockConfig, {
      workspacePath
    });

    // 建立分身模式 SubAgent
    const cloneAgent = await mainAgent.createSubAgent(cloneId, { isClone: true });

    expect(mainAgent.getSubAgent(cloneId)).toBe(cloneAgent);
    expect(cloneAgent.workspacePath).toBe(mainAgent.workspacePath); // 工作區共享
    expect(cloneAgent['oplogDir']).toBe(mainAgent['oplogDir']); // 記憶共享

    // 驗證分身狀態隔離與日誌協作
    mainAgent.recordUsage(10, 20, 5);
    cloneAgent.recordUsage(5, 5, 2);

    await new Promise(resolve => setTimeout(resolve, 100));

    // 驗證二者是否都成功往共享 oplog 檔案寫入
    const oplogFilePath = path.join(mainAgent['oplogDir'], '.oplog.jsonl');
    expect(fs.existsSync(oplogFilePath)).toBe(true);

    const logContent = fs.readFileSync(oplogFilePath, 'utf-8');
    expect(logContent).toContain('Successfully spawned clone SubAgent');
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
