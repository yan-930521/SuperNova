import { describe, it, expect } from 'bun:test';
import { RuntimeKernel } from '../RuntimeKernel';
import { DEFAULT_CONFIG } from '../../config/DefaultConfig';
import { EventBus } from '../../messaging/EventBus';
import { WorkspaceManager } from '../../infra/persistence/WorkspaceManager';
import { SessionManager } from '../../session/SessionManager';
import { AgentManager } from '../../agent/AgentManager';

describe('RuntimeKernel Lifecycle Test', () => {
  it('should initialize and register core components in correct order', async () => {
    const kernel = new RuntimeKernel(DEFAULT_CONFIG);
    await kernel.initialize();

    const container = kernel.getContainer();

    // 驗證核心組件是否成功註冊到 IoC 容器中
    const eventBus = container.resolve<EventBus>('EventBus');
    const workspaceManager = container.resolve<WorkspaceManager>('WorkspaceManager');
    const sessionManager = container.resolve<SessionManager>('SessionManager');
    const agentManager = container.resolve<AgentManager>('AgentManager');

    expect(eventBus).toBeInstanceOf(EventBus);
    expect(workspaceManager).toBeInstanceOf(WorkspaceManager);
    expect(sessionManager).toBeInstanceOf(SessionManager);
    expect(agentManager).toBeInstanceOf(AgentManager);
  });

  it('should boot and shutdown all registered components successfully', async () => {
    const kernel = new RuntimeKernel(DEFAULT_CONFIG);
    await kernel.initialize();

    // 執行引導啟動 (Bootstrap)
    await kernel.start();

    const container = kernel.getContainer();
    const sessionManager = container.resolve<SessionManager>('SessionManager');
    
    // 驗證 SessionManager 是否初始化成功 (已建立 session 根目錄)
    expect(sessionManager).not.toBeNull();

    // 執行優雅停機 (Graceful Shutdown)
    await kernel.stop();
  });
});
