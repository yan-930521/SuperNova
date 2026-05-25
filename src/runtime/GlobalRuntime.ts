import * as path from 'path';

import { Config } from '../config/Config';
import { ConfigLoader } from '../config/ConfigLoader';
import { EventBus } from '../infra/EventBus';
import { GlobalRegistry } from '../infra/GlobalRegistry';
import { LogLevel, recorder } from '../infra/LogManager';
import { ModelRegistry } from '../infra/ModelRegistry';
import { FileSystemAgentRepository } from '../infra/storage/FileSystemAgentRepository';
import { FileSystemSessionRepository } from '../infra/storage/FileSystemSessionRepository';
import { FileSystemTaskRepository } from '../infra/storage/FileSystemTaskRepository';
import { FileSystemUserRepository } from '../infra/storage/FileSystemUserRepository';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { AgentManager } from '../manager/AgentManager';
import { SessionManager } from '../manager/SessionManager';
import { TaskManager } from '../manager/TaskManager';
import { UserManager } from '../manager/UserManager';

/**
 * 全局運行時類 (Global Runtime) - SuperNova 2.0
 * 系統的核心入口，負責初始化基礎設施、Manager 層並管理生命週期。
 */
export class GlobalRuntime {
  /** 儲存 Runtime 實例，供靜態方法 getInstance 獲取 (實現單例存取) */
  private static instance: GlobalRuntime;
  
  /** 系統運行狀態 */
  private isRunning: boolean = false;
  
  /** 全局配置對象 */
  public config?: Config;
  
  // --- 核心管理器 (從 GlobalRegistry 存取或直接持有) ---
  public userManager!: UserManager;
  public sessionManager!: SessionManager;
  public agentManager!: AgentManager;
  public taskManager!: TaskManager;

  /**
   * @param eventBus 全局事件總線
   * @param modelRegistry 模型註冊表
   */
  constructor(
    public readonly eventBus: EventBus,
    public readonly modelRegistry: ModelRegistry
  ) {
    GlobalRuntime.instance = this;
  }

  /**
   * 獲獲全域 Runtime 實例
   */
  public static getInstance(): GlobalRuntime {
    if (!GlobalRuntime.instance) {
      throw new Error('GlobalRuntime not initialized. Call constructor first.');
    }
    return GlobalRuntime.instance;
  }

  /**
   * 啟動系統全局環境
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    if (!this.config) {
      const loader = new ConfigLoader();
      this.config = await loader.bootstrap('./supernova.json');
    }

    // --- 1. 初始化持久層 (Repositories) ---
    const root = process.cwd();
    GlobalRegistry.userRepo = new FileSystemUserRepository(path.join(root, 'workspace/users'));
    GlobalRegistry.sessionRepo = new FileSystemSessionRepository(path.join(root, 'workspace/sessions'));
    GlobalRegistry.taskRepo = new FileSystemTaskRepository(path.join(root, 'workspace/tasks'));
    
    const agentsDir = this.config?.runtime.agents_dir || './agents';
    GlobalRegistry.agentRepo = new FileSystemAgentRepository(agentsDir);

    // --- 2. 初始化業務層 (Managers) ---
    this.userManager = new UserManager(GlobalRegistry.userRepo);
    this.sessionManager = new SessionManager(GlobalRegistry.sessionRepo);
    this.agentManager = new AgentManager(GlobalRegistry.agentRepo);
    this.taskManager = new TaskManager(this.agentManager, GlobalRegistry.taskRepo);

    // 註冊到全局註冊表
    GlobalRegistry.userManager = this.userManager;
    GlobalRegistry.sessionManager = this.sessionManager;
    GlobalRegistry.agentManager = this.agentManager;
    GlobalRegistry.taskManager = this.taskManager;
    GlobalRegistry.eventBus = this.eventBus;

    // --- 3. 初始化可觀測性與日誌 ---
    const consoleLevel = (process.env.CONSOLE_LOG_LEVEL as LogLevel) || 'INFO';
    recorder.addTransport(new ConsoleTransport(consoleLevel));
    recorder.addTransport(new FileTransport('DEBUG'));
    
    recorder.info('SuperNova 2.0 Runtime Initializing...', { type: 'SYSTEM' });

    // --- 4. 載入代理配置 ---
    recorder.info(`Loading all agents from repository: ${agentsDir}...`, { type: 'SYSTEM' });
    await this.agentManager.loadAllAgents();

    this.isRunning = true;
    recorder.info('SuperNova 2.0 Runtime is active and ready.', { type: 'SYSTEM' });
  }

  /**
   * 停止系統
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    recorder.info('Runtime stopped.', { type: 'SYSTEM' });
  }
}
