import { Config } from '../config/Config';
import { ConfigLoader } from '../config/ConfigLoader';
import { AgentRegistry } from '../infra/AgentRegistry';
import { EventBus } from '../infra/EventBus';
import { recorder, LogLevel } from '../infra/LogManager';
import { ModelRegistry } from '../infra/ModelRegistry';
import { SessionManager } from '../infra/SessionManager';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { TaskManager } from '../task/TaskManager';

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
   * @param sessionManager 會話管理器
   * @param agentRegistry 代理註冊表
   * @param eventBus 全局事件總線
   * @param modelRegistry 模型註冊表
   */
  constructor(
    public readonly sessionManager: SessionManager,
    public readonly agentRegistry: AgentRegistry,
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

    const consoleLevel = (process.env.CONSOLE_LOG_LEVEL as LogLevel) || 'INFO';
    recorder.addTransport(new ConsoleTransport(consoleLevel));
    recorder.addTransport(new FileTransport('DEBUG'));
    
    recorder.info('SuperNova 2.0 Runtime Initializing...', { type: 'SYSTEM' });

    const agentsDir = this.config?.runtime.agents_dir || './agents';
    recorder.info(`Auto-loading agents from ${agentsDir}...`, { type: 'SYSTEM' });
    await this.agentRegistry.loadAllAgentsFromDir(agentsDir);

    // 在 Agent 載入與模型配置完成後，才初始化 TaskManager
    this.taskManager = new TaskManager(this.agentRegistry);

    this.isRunning = true;
    recorder.info('SuperNova 2.0 Runtime is active and listening for events.', { type: 'SYSTEM' });
  }

  /**
   * 停止系統
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    recorder.info('Runtime stopped.', { type: 'SYSTEM' });
  }
}
