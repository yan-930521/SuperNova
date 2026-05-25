import * as path from 'path';
import { Config } from '../config/Config';
import { ConfigLoader } from '../config/ConfigLoader';
import { AgentManager } from '../infra/AgentManager';
import { EventBus } from '../infra/EventBus';
import { recorder, LogLevel } from '../infra/LogManager';
import { ModelRegistry } from '../infra/ModelRegistry';
import { SessionManager } from '../infra/SessionManager';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { TaskManager } from '../task/TaskManager';
import { GlobalRegistry } from '../infra/GlobalRegistry';
import { FileSystemUserRepository } from '../infra/storage/FileSystemUserRepository';
import { FileSystemSessionRepository } from '../infra/storage/FileSystemSessionRepository';
import { FileSystemTaskRepository } from '../infra/storage/FileSystemTaskRepository';
import { FileSystemAgentRepository } from '../infra/storage/FileSystemAgentRepository';

/**
 * 全局運行時類 (Global Runtime) - SuperNova 2.0
 * 系統的核心入口，負責初始化基礎設施並管理生命週期。
 */
export class GlobalRuntime {
  /** 儲存 Runtime 實例，供靜態方法 getInstance 獲取 (實現單例存取) */
  private static instance: GlobalRuntime;
  
  /** 系統運行狀態 */
  private isRunning: boolean = false;
  
  /** 全局配置對象 */
  public config?: Config;
  
  /** 全局任務管理器 (控制 Planning 與 Execution) */
  public taskManager!: TaskManager;

  /**
   * @param sessionManager 會話管理器 (已整合 Repository)
   * @param agentManager 代理管理器 (已整合 Repository)
   * @param eventBus 全局事件總線
   * @param modelRegistry 模型註冊表
   */
  constructor(
    public readonly sessionManager: SessionManager,
    public readonly agentManager: AgentManager,
    public readonly eventBus: EventBus,
    public readonly modelRegistry: ModelRegistry
  ) {
    GlobalRuntime.instance = this;
  }

  /**
   * 獲取全域 Runtime 實例
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

    // --- 1. 初始化新版模塊化持久層 (Phase 1.5) ---
    const root = process.cwd();
    GlobalRegistry.userRepo = new FileSystemUserRepository(path.join(root, 'workspace/users'));
    GlobalRegistry.sessionRepo = new FileSystemSessionRepository(path.join(root, 'workspace/sessions'));
    GlobalRegistry.taskRepo = new FileSystemTaskRepository(path.join(root, 'workspace/tasks'));
    
    const agentsDir = this.config?.runtime.agents_dir || './agents';
    GlobalRegistry.agentRepo = new FileSystemAgentRepository(agentsDir);

    // --- 2. 初始化可觀測性與日誌 ---
    const consoleLevel = (process.env.CONSOLE_LOG_LEVEL as LogLevel) || 'INFO';
    recorder.addTransport(new ConsoleTransport(consoleLevel));
    recorder.addTransport(new FileTransport('DEBUG'));
    
    recorder.info('SuperNova 2.0 Runtime Initializing...', { type: 'SYSTEM' });

    // --- 3. 載入代理配置與實例化 ---
    recorder.info(`Loading all agents from repository: ${agentsDir}...`, { type: 'SYSTEM' });
    await this.agentManager.loadAllAgents();

    // --- 4. 初始化任務系統 ---
    // 在 Agent 載入與模型配置完成後，才初始化 TaskManager
    this.taskManager = new TaskManager(this.agentManager);

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
