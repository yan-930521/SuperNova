import * as path from 'node:path';

import { UserService } from '../application/identity/UserService';
import { MemoryService } from '../application/memory/MemoryService';
import { Config } from '../config/Config';
import { ConfigLoader } from '../config/ConfigLoader';
import { ComponentContainer } from '../core/container/ComponentContainer';
import { EventBus } from '../core/messaging/MessageBus';
import { LogLevel, recorder } from '../infra/LogManager';
import { ModelRegistry } from '../infra/ModelRegistry';
import {
    FileSystemAgentRepository
} from '../infra/persistence/filesystem/FileSystemAgentRepository';
import {
    FileSystemMemoryRepository
} from '../infra/persistence/filesystem/FileSystemMemoryRepository';
import {
    FileSystemSessionRepository
} from '../infra/persistence/filesystem/FileSystemSessionRepository';
import { FileSystemTaskRepository } from '../infra/persistence/filesystem/FileSystemTaskRepository';
// 新版持久層
import { FileSystemUserRepository } from '../infra/persistence/filesystem/FileSystemUserRepository';
import { PulseEngine } from '../infra/PulseEngine';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { ToolRegistry } from '../tool/ToolRegistry';

/**
 * 全局運行時類 (Global Runtime) - SuperNova 0.3.0
 * 系統組合根 (Composition Root)，負責初始化組件容器、註冊服務並管理生命週期。
 */
export class GlobalRuntime {
  private static instance: GlobalRuntime;
  private isRunning: boolean = false;

  public readonly container: ComponentContainer;

  // --- 暴露核心組件供外部快速訪問 (Service Location Pattern) ---
  public eventBus!: EventBus;
  public modelRegistry!: ModelRegistry;
  public toolRegistry!: ToolRegistry;

  public config!: Config;

  /**
   * 構造函數：初始化容器
   */
  private constructor() {
    this.container = new ComponentContainer();
    GlobalRuntime.instance = this;
  }

  /**
   * 獲取全域 Runtime 實例
   */
  public static getInstance(): GlobalRuntime {
    if (!GlobalRuntime.instance) {
      GlobalRuntime.instance = new GlobalRuntime();
    }
    return GlobalRuntime.instance;
  }

  /**
   * 啟動系統全局環境
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    // 1. 初始化日誌系統
    this.setupLogging();
    recorder.info('[GlobalRuntime] SuperNova 0.3.0 is initializing...', { type: 'SYSTEM' });

    // 2. 載入配置
    if (!this.config) {
      const loader = new ConfigLoader();
      this.config = await loader.bootstrap('./supernova.json');
    }

    // 3. 註冊核心基礎設施
    this.eventBus = new EventBus();
    this.modelRegistry = new ModelRegistry();
    this.modelRegistry.registerDefaultModels();
    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.registerStandardTools();

    const pulseEngine = new PulseEngine(this.eventBus);

    this.container.register('EventBus', this.eventBus);
    this.container.register('ModelRegistry', this.modelRegistry);
    this.container.register('ToolRegistry', this.toolRegistry);
    this.container.register('PulseEngine', pulseEngine);

    // 4. 註冊持久層 (Repositories)
    const root = process.cwd();
    const userRepo = new FileSystemUserRepository(path.join(root, 'workspace/users'));
    const agentRepo = new FileSystemAgentRepository(this.config?.runtime.agents_dir || './agents');
    const sessionRepo = new FileSystemSessionRepository(path.join(root, 'workspace/sessions'));
    const taskRepo = new FileSystemTaskRepository(path.join(root, 'workspace/tasks'));
    const memoryRepo = new FileSystemMemoryRepository(path.join(root, 'workspace/memory'));

    this.container.register('UserRepo', userRepo);
    this.container.register('AgentRepo', agentRepo);
    this.container.register('SessionRepo', sessionRepo);
    this.container.register('TaskRepo', taskRepo);
    this.container.register('MemoryRepo', memoryRepo);

    // 5. 註冊應用層服務 (Services)
    const userService = new UserService(userRepo);
    this.container.register('UserService', userService);

    const memoryService = new MemoryService(memoryRepo);
    this.container.register('MemoryService', memoryService);


    // 6. 啟動所有組件生命週期 (這會觸發 agentService.start() 進而執行 loadAllAgents)
    await this.container.boot();

    this.isRunning = true;
    recorder.info('[GlobalRuntime] SuperNova 0.3.0 is active and ready.', { type: 'SYSTEM' });
  }

  /**
   * 停止系統
   */
  async stop(): Promise<void> {
    recorder.info('[GlobalRuntime] Stopping runtime...', { type: 'SYSTEM' });
    await this.container.shutdown();
    this.isRunning = false;
    recorder.info('[GlobalRuntime] Runtime stopped.', { type: 'SYSTEM' });
  }

  /**
   * 設定日誌傳輸器
   */
  private setupLogging(): void {
    const consoleLevel = (process.env.CONSOLE_LOG_LEVEL as LogLevel) || 'INFO';
    recorder.addTransport(new ConsoleTransport(consoleLevel));
    recorder.addTransport(new FileTransport('DEBUG'));
  }
}
