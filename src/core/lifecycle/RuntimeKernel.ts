import * as path from 'path';

import { AgentManager } from '../agent/AgentManager';
import { Config } from '../config/Config';
import { ComponentContainer } from '../container/ComponentContainer';
import { LogManager } from '../infra/LogManager';
import {
    FileSystemAgentStateRepository, FileSystemDataBlockRepository, FileSystemSessionRepository
} from '../infra/persistence';
import { WorkspaceManager } from '../infra/persistence/WorkspaceManager';
import { EventBus } from '../messaging/EventBus';
import { SessionManager } from '../session/SessionManager';
import { ILifecycle } from './ILifecycle';

/**
 * SuperNova 運行時內核 (Runtime Kernel)
 * 負責全局系統框架組件的啟動引導 (Bootstrap)、依賴註冊與優雅停機 (Graceful Shutdown)
 */
export class RuntimeKernel implements ILifecycle {
  private readonly logger = LogManager.recorder;
  private readonly container: ComponentContainer;
  private isHooked = false;

  constructor(
    private readonly config: Config,
    container?: ComponentContainer
  ) {
    this.container = container || new ComponentContainer();
  }

  /**
   * 初始化內核，按依賴拓撲順序實例化並註冊核心管理器
   */
  public async initialize(): Promise<void> {
    this.logger.info('[Kernel] Initializing Runtime Kernel...');

    try {
      // 1. 實例化底層通信組件 - EventBus
      // EventBus 是系統的神經系統，需最先被註冊
      const eventBus = new EventBus();

      // 2. 實例化底層儲存庫 (Repositories) - DI 中樞
      const sessionBaseDir = path.join(process.cwd(), this.config.storage.base_dir, this.config.storage.session_dir);
      
      const sessionRepo = new FileSystemSessionRepository(this.config, sessionBaseDir);
      const dataBlockRepo = new FileSystemDataBlockRepository(this.config, sessionBaseDir);
      const agentStateRepo = new FileSystemAgentStateRepository(this.config, sessionBaseDir);

      // 3. 實例化底層儲存組件 - WorkspaceManager
      // WorkspaceManager 內部會依據工作區類型動態分配 StorageDriver (VFS/Git)
      const workspaceManager = new WorkspaceManager(this.config, process.cwd());

      // AgentManager 負責所有 Agent 狀態管理與生命週期，注入 agentStateRepo 與 eventBus
      const agentManager = new AgentManager(this.config, agentStateRepo, eventBus, dataBlockRepo, workspaceManager);

      // SessionManager 負責管理會話，統一攔截與派發 AgentMessage
      const sessionManager = new SessionManager(this.config, sessionRepo, workspaceManager, agentManager, dataBlockRepo, eventBus);

      // 5. 依照依賴拓撲順序註冊至 IoC 容器
      // 容器啟動時會按照此註冊順序執行 initialize() 和 start()
      this.container.register('EventBus', eventBus);
      this.container.register('WorkspaceManager', workspaceManager);
      this.container.register('SessionManager', sessionManager);
      this.container.register('AgentManager', agentManager);
      this.container.register('SessionRepository', sessionRepo);
      this.container.register('DataBlockRepository', dataBlockRepo);
      this.container.register('AgentStateRepository', agentStateRepo);

      this.logger.info('[Kernel] Kernel components registered successfully');
    } catch (error: any) {
      this.logger.error(`[Kernel] Kernel initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 啟動內核與所有核心組件，並註冊作業系統信號監聽
   */
  public async start(): Promise<void> {
    this.logger.info('[Kernel] Booting Runtime Kernel...');

    try {
      // 啟動 IoC 容器，容器會依序執行所有組件的 initialize() 和 start()
      await this.container.boot();

      // 註冊作業系統關閉信號監聽 (SIGINT / SIGTERM)
      this.setupSignalHandlers();

      this.logger.info('[Kernel] Kernel booted and signal handlers registered');
    } catch (error: any) {
      this.logger.error(`[Kernel] Kernel boot failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止內核，停止所有組件並註銷信號監聽
   */
  public async stop(): Promise<void> {
    this.logger.info('[Kernel] Shutting down Runtime Kernel...');

    try {
      // 註銷信號監聽，避免重複觸發或引發 memory leak
      this.removeSignalHandlers();

      // 停止 IoC 容器，容器會以「註冊順序的相反順序」依序調用所有組件的 stop()
      // 停機順序會自動為: SessionManager -> WorkspaceManager -> EventBus
      await this.container.shutdown();

      this.logger.info('[Kernel] Kernel shutdown completed');
    } catch (error: any) {
      this.logger.error(`[Kernel] Kernel shutdown failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 獲取 IoC 組件容器實例
   */
  public getContainer(): ComponentContainer {
    return this.container;
  }

  /**
   * 設置作業系統停機信號監聽
   */
  private setupSignalHandlers(): void {
    if (this.isHooked) return;

    process.on('SIGINT', this.handleSignal);
    process.on('SIGTERM', this.handleSignal);
    this.isHooked = true;
  }

  /**
   * 註銷作業系統停機信號監聽
   */
  private removeSignalHandlers(): void {
    if (!this.isHooked) return;

    process.off('SIGINT', this.handleSignal);
    process.off('SIGTERM', this.handleSignal);
    this.isHooked = false;
  }

  /**
   * 停機信號處理常式
   */
  private handleSignal = async (signal: string): Promise<void> => {
    this.logger.warn(`[Kernel] Received signal ${signal}. Starting graceful shutdown...`);
    try {
      await this.stop();
      process.exit(0);
    } catch (error: any) {
      this.logger.error(`[Kernel] Graceful shutdown aborted due to error: ${error.message}`);
      process.exit(1);
    }
  };
}
