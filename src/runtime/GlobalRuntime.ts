import * as path from 'path';

import { Config } from '../config/Config';
import { ConfigLoader } from '../config/ConfigLoader';
import { EventBus } from '../infra/EventBus';
import { LogLevel, recorder } from '../infra/LogManager';
import { ModelRegistry } from '../infra/ModelRegistry';
import { FileSystemAgentRepository } from '../infra/storage/FileSystemAgentRepository';
import { FileSystemSessionRepository } from '../infra/storage/FileSystemSessionRepository';
import { FileSystemTaskRepository } from '../infra/storage/FileSystemTaskRepository';
import { FileSystemUserRepository } from '../infra/storage/FileSystemUserRepository';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { IAgentRepository } from '../infra/types/agent';
import { IUserRepository } from '../infra/types/identity';
import { ISessionRepository } from '../infra/types/session';
import { ITaskRepository } from '../infra/types/task';
import { AgentManager } from '../manager/AgentManager';
import { SessionManager } from '../manager/SessionManager';
import { TaskManager } from '../manager/TaskManager';
import { UserManager } from '../manager/UserManager';
import { ToolRegistry } from '../tool/ToolRegistry';

/**
 * 全局運行時類 (Global Runtime) - SuperNova 2.0
 * 系統的核心入口，負責初始化基礎設施、Manager 層並管理生命週期。
 * 同時作為全域實例的「真理來源 (Single Source of Truth)」。
 */
export class GlobalRuntime {
	/** 儲存 Runtime 實例，供靜態方法 getInstance 獲取 (實現單例存取) */
	private static instance: GlobalRuntime;

	/** 系統運行狀態 */
	private isRunning: boolean = false;

	/** 全局配置對象 */
	public config?: Config;

	// --- 1. 持久層 (Repositories) ---
	public userRepo!: IUserRepository;
	public sessionRepo!: ISessionRepository;
	public taskRepo!: ITaskRepository;
	public agentRepo!: IAgentRepository;

	// --- 2. 業務層 (Managers) ---
	public userManager!: UserManager;
	public sessionManager!: SessionManager;
	public agentManager!: AgentManager;
	public taskManager!: TaskManager;

	// --- 3. 基礎組件 (Bus & Registries) ---
	public eventBus: EventBus;
	public modelRegistry: ModelRegistry;
	public toolRegistry: ToolRegistry;

	/**
	 * 構造函數初始化基礎組件
	 */
	constructor() {
		this.eventBus = new EventBus();
		this.modelRegistry = new ModelRegistry();
		this.toolRegistry = new ToolRegistry();
		GlobalRuntime.instance = this;
	}

	/**
	 * 獲獲全域 Runtime 實例
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

		if (!this.config) {
			const loader = new ConfigLoader();
			this.config = await loader.bootstrap('./supernova.json');
		}

		// --- 1. 初始化持久層 (Repositories) ---
		const root = process.cwd();
		this.userRepo = new FileSystemUserRepository(path.join(root, 'workspace/users'));
		this.sessionRepo = new FileSystemSessionRepository(path.join(root, 'workspace/sessions'));
		this.taskRepo = new FileSystemTaskRepository(path.join(root, 'workspace/tasks'));

		const agentsDir = this.config?.runtime.agents_dir || './agents';
		this.agentRepo = new FileSystemAgentRepository(agentsDir);

		// --- 2. 註冊標準工具 ---
		this.toolRegistry.registerStandardTools();

		// --- 3. 初始化業務層 (Managers) ---
		this.userManager = new UserManager(this.userRepo);
		this.sessionManager = new SessionManager(this.sessionRepo);
		this.agentManager = new AgentManager(this.agentRepo);
		this.agentManager.setRuntime(this); // 注入運行時實例
		this.taskManager = new TaskManager(this.agentManager, this.taskRepo);

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
