import * as path from 'node:path';

import { ActingAgent } from '../agent/roles/ActingAgent';
import { CheckingAgent } from '../agent/roles/CheckingAgent';
import { DoingAgent } from '../agent/roles/DoingAgent';
import { PersonaAgent } from '../agent/roles/PersonaAgent';
import { PlanningAgent } from '../agent/roles/PlanningAgent';
// Agent Roles
import { SupervisorAgent } from '../agent/roles/SupervisorAgent';
import { ContextService } from '../application/context/ContextService';
import { UserService } from '../application/identity/UserService';
import { MemoryService } from '../application/memory/MemoryService';
import { SessionService } from '../application/session/SessionService';
import { TaskService } from '../application/task/TaskService';
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
 * 全局運行時類 (Global Runtime) - SuperNova 0.4.0
 * 系統組合根 (Composition Root)，負責初始化組件容器、註冊服務並管理生命週期。
 */
export class GlobalRuntime {
  private static instance: GlobalRuntime;
  private isRunning: boolean = false;

  public readonly container: ComponentContainer;

  // --- 暴露核心組件供外部快速訪問 (Service Location Pattern) ---
  public systemBus!: EventBus;
  public agentBus!: EventBus;
  public modelRegistry!: ModelRegistry;
  public toolRegistry!: ToolRegistry;

  public config!: Config;

  // --- 內建核心 Agents ---
  public personaAgent!: PersonaAgent;
  public supervisorAgent!: SupervisorAgent;
  public planningAgent!: PlanningAgent;
  public doingAgent!: DoingAgent;
  public checkingAgent!: CheckingAgent;
  public actingAgent!: ActingAgent;

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
    recorder.info('[GlobalRuntime] SuperNova 0.4.0 is initializing...', { type: 'SYSTEM' });

    // 2. 載入配置
    if (!this.config) {
      const loader = new ConfigLoader();
      this.config = await loader.bootstrap('./supernova.json');
    }

    // 3. 註冊核心基礎設施
    this.systemBus = new EventBus();
    this.agentBus = new EventBus();
    
    this.modelRegistry = new ModelRegistry();
    this.modelRegistry.registerDefaultModels();
    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.registerStandardTools();

    // PulseEngine 需要監聽 systemBus 的 Tick，但可能會觸發 Agent 的 Escalate
    const pulseEngine = new PulseEngine(this.systemBus, this.agentBus);

    this.container.register('SystemBus', this.systemBus);
    this.container.register('AgentBus', this.agentBus);
    this.container.register('ModelRegistry', this.modelRegistry);
    this.container.register('ToolRegistry', this.toolRegistry);
    this.container.register('PulseEngine', pulseEngine);

    // 4. 註冊持久層 (Repositories)
    const root = process.cwd();
    const storageBase = path.join(root, this.config.storage.base_dir);

    const userRepo = new FileSystemUserRepository(path.join(storageBase, 'users'));
    const agentRepo = new FileSystemAgentRepository(this.config?.runtime.agents_dir || './agents');
    const sessionRepo = new FileSystemSessionRepository(path.join(storageBase, this.config.storage.sessions_dir));
    const taskRepo = new FileSystemTaskRepository(storageBase);
    const memoryRepo = new FileSystemMemoryRepository(storageBase);

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

    const contextService = new ContextService();
    this.container.register('ContextService', contextService);

    const sessionService = new SessionService(sessionRepo);
    this.container.register('SessionService', sessionService);

    const taskService = new TaskService(taskRepo, this.systemBus, this.agentBus, this.config);
    this.container.register('TaskService', taskService);

    // 6. 啟動所有組件生命週期
    await this.container.boot();

    // 7. 初始化核心無狀態 Agent 單例 (只傳入 agentBus)
    this.personaAgent = new PersonaAgent('Persona-Xiamo', this.agentBus);
    this.supervisorAgent = new SupervisorAgent('Supervisor-01', this.agentBus);
    this.planningAgent = new PlanningAgent('Planner-01', this.agentBus);
    this.doingAgent = new DoingAgent('Doer-01', this.agentBus);
    this.checkingAgent = new CheckingAgent('Checker-01', this.agentBus);
    this.actingAgent = new ActingAgent('Actor-01', this.agentBus);
    
    recorder.info('[GlobalRuntime] Core Stateless Agents registered.', { type: 'SYSTEM' });

    this.isRunning = true;
    recorder.info('[GlobalRuntime] SuperNova 0.4.0 is active and ready.', { type: 'SYSTEM' });
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
