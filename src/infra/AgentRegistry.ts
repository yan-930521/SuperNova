import type { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';
import type { IAgent } from '../../interfaces/agent/IAgent';
import type { IModelRegistry } from '../../interfaces/runtime/IModelRegistry';
import type { ITaskPlanEngine } from '../../interfaces/agent/ITaskPlanEngine';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './LogManager';

import { BaseAgent } from '../agent/BaseAgent';
import { CoordinatorAgent } from '../agent/CoordinatorAgent';
import { EvaluatorAgent } from '../agent/EvaluatorAgent';
import { TaskPlanEngine } from '../agent/TaskPlanEngine';
import { WorkerAgent } from '../agent/WorkerAgent';

import type { IToolRegistry } from '../../interfaces/infra/IToolRegistry';
/**
 * AgentRegistry 類
 * 實作 IAgentRegistry 接口，負責管理系統中所有可用的 Agent 實例。
 */
export class AgentRegistry implements IAgentRegistry {
	private agents: Map<string, IAgent> = new Map();
	private taskPlanEngine?: ITaskPlanEngine;
	private agentsDir: string = './agents';
	private defaultFallbackAgentId: string = 'default-worker';

	constructor(
		private modelRegistry?: IModelRegistry,
		private toolRegistry?: IToolRegistry
	) {
		if (this.modelRegistry) {
			this.taskPlanEngine = new TaskPlanEngine(this.modelRegistry);
		}
	}

	/**
	 * 更新註冊表的運行時配置
	 */
	updateConfig(agentsDir: string, defaultId: string): void {
		this.agentsDir = agentsDir;
		this.defaultFallbackAgentId = defaultId;
		logger.info(`[AgentRegistry] Config updated: agents_dir=${agentsDir}, default_id=${defaultId}`, { type: 'SYSTEM' });
	}

	/**
	 * 手動註冊一個 Agent 實例
	 */
	register(agent: IAgent): void {
		logger.info(`[AgentRegistry] Registering agent: ${agent.id} (role: ${agent.role})`, { type: 'SYSTEM' });
		this.agents.set(agent.id, agent);
	}

	/**
	 * 根據 ID 獲取已註冊的 Agent 實例
	 */
	getAgent(id: string): IAgent | undefined {
		return this.agents.get(id);
	}

	/**
	 * 獲取所有已註冊的 Agent 實例
	 */
	getAllAgents(): IAgent[] {
		return Array.from(this.agents.values());
	}

	/**
	 * 根據 Role 獲取所有匹配的 Agent 實例 (大小寫不敏感)
	 */
	getAgentByRole(role: string): IAgent[] {
		return this.getAllAgents().filter(agent => agent.role.toLowerCase() === role.toLowerCase());
	}

	/**
	 * 根據 ID 從檔案加載並實例化 Agent
	 * @param id Agent ID
	 * @param agentsDir Agent 設定目錄 (選擇性)
	 */
	async loadAgentById(id: string, agentsDir?: string): Promise<IAgent> {
		const dir = agentsDir || this.agentsDir || path.resolve(process.cwd(), 'agents');
		const filePath = path.join(dir, `${id}.json`);

		if (!fs.existsSync(filePath)) {
			throw new Error(`Agent config not found for ID: ${id} (Searched in ${filePath})`);
		}

		const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		// 強制將檔案中的 ID 與請求的 ID 對齊，若檔案中未定義則補上
		config.id = config.id || id;

		return await this.loadAgentFromJSON(config);
	}

	/**
	 * 從 JSON 數據動態加載並實例化 Agent
	 * @param agentJson Agent 的序列化數據
	 */
	async loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent> {
		const { type, id } = agentJson;
		let agent: IAgent;

		logger.info(`[AgentRegistry] Loading agent from JSON: ${id} (type: ${type})`, { type: 'SYSTEM' });

		// 根據 type 映射具體的實作類
		switch (type) {
			case 'COORDINATOR':
				agent = new CoordinatorAgent(this.taskPlanEngine, this);
				break;
			case 'EVALUATOR':
				if (!this.modelRegistry) {
					throw new Error('ModelRegistry is required to instantiate EVALUATOR agent.');
				}
				agent = new EvaluatorAgent(this.modelRegistry);
				break;
			case 'WORKER':
				if (!this.toolRegistry) {
					logger.warn('[AgentRegistry] Creating WORKER agent without ToolRegistry.', { type: 'SYSTEM' });
				}
				agent = new WorkerAgent(this.toolRegistry!, this.modelRegistry);
				break;
			case 'BASE':
				agent = new BaseAgent();
				break;
			default:
				throw new Error(`Unknown agent type: ${type}`);
		}

		// 初始化 Agent 基本屬性與身份
		await agent.initFromJSON(agentJson);

		// [Tool Binding Logic] 
		// 如果是 Worker 且有 ToolRegistry，根據其 capabilities 進行工具過濾或檢查 (目前 Worker 是全量存取)
		// 如果未來需要針對特定 Agent 限制工具集，可以在此處實現篩選邏輯
		if (this.toolRegistry && agent.capabilities && agent.capabilities.length > 0) {
			const availableTools = this.toolRegistry.listTools().map(t => t.name.toLowerCase());
			const matchedTools = agent.capabilities.filter(cap => availableTools.includes(cap.toLowerCase()));
			if (matchedTools.length > 0) {
				logger.info(`[AgentRegistry] Agent ${agent.id} matched ${matchedTools.length} tools based on capabilities: ${matchedTools.join(', ')}`, { type: 'SYSTEM' });
			}
		}

		this.register(agent);
		return agent;
	}

	/**
	 * 從指定目錄加載所有 Agent 配置
	 * @param dirPath 目錄路徑
	 */
	async loadAllAgentsFromDir(dirPath?: string): Promise<void> {
		const targetPath = dirPath || this.agentsDir;
		const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);
		if (!fs.existsSync(absolutePath)) {
			logger.warn(`[AgentRegistry] Directory not found: ${absolutePath}`, { type: 'SYSTEM' });
			return;
		}

		const files = fs.readdirSync(absolutePath);
		for (const file of files) {
			if (file.endsWith('.json')) {
				try {
					const config = JSON.parse(fs.readFileSync(path.join(absolutePath, file), 'utf-8'));
					await this.loadAgentFromJSON(config);
				} catch (error) {
					logger.error(`[AgentRegistry] Failed to load agent from ${file}:`, { payload: { error }, type: 'SYSTEM' });
				}
			}
		}
	}

	/**
	 * 確保存在預設的 Worker Agent (優先從配置加載，若無則報錯)
	 */
	async ensureDefaultWorker(): Promise<IAgent> {
		const defaultId = this.defaultFallbackAgentId;
		let agent = this.getAgent(defaultId);
		if (!agent) {
			try {
				agent = await this.loadAgentById(defaultId);
			} catch (error) {
				throw new Error(`Default worker agent (${defaultId}) not found. Please ensure it exists in ${this.agentsDir}`);
			}
		}
		return agent;
	}
}
