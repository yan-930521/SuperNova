import type { ISession } from '../../interfaces/session/ISession';
import type { IMiddleware } from '../../interfaces/session/IMiddleware';
import { MiddlewareChain } from './MiddlewareChain';
import { ParallelScheduler } from './ParallelScheduler';
import { ReadyQueue } from './ReadyQueue';
import { TaskGraph } from './TaskGraph';

import type { IReadyQueue } from '../../interfaces/session/IReadyQueue';
import type { ISnapshotManager } from '../../interfaces/infra/ISnapshotManager';
import type { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';
import type { ICoordinator } from '../../interfaces/agent/ICoordinator';
import { logger } from '../infra/LogManager';

/**
 * 會話基礎實作類
 * 提供 ISession 接口的核心功能，包括中間件管理與任務調度。
 */
export class BaseSession implements ISession {
	public status: string = 'IDLE';
	protected toolChain: MiddlewareChain = new MiddlewareChain();
	protected mutationChain: MiddlewareChain = new MiddlewareChain();

	/** 任務依賴圖 */
	public taskGraph: TaskGraph = new TaskGraph();
	/** 並行調度器 */
	public scheduler: ParallelScheduler = new ParallelScheduler();
	/** 就緒任務隊列 */
	public readyQueue: IReadyQueue = new ReadyQueue();

	/** 參與此會話的 Agent ID 列表 */
	protected agentIds: string[] = [];
	/** 快照管理器 */
	public snapshotManager?: ISnapshotManager;
	/** Agent 註冊表 (用於快照時獲取 Agent 狀態) */
	public agentRegistry?: IAgentRegistry;

	/** 任務完成計數 (用於快照索引) */
	private completedTaskCount: number = 0;
	/** 儲存已完成任務的結果 */
	private taskResults: Map<string, any> = new Map();

	constructor(
		public id: string,
		public goal: string
	) { }

	/**
	 * 註冊參與會話的 Agent
	 */
	addAgent(agentId: string): void {
		if (!this.agentIds.includes(agentId)) {
			this.agentIds.push(agentId);
		}
	}

	/**
	 * 註冊中間件
	 */
	use(pipeline: 'TOOL' | 'MUTATION', middleware: IMiddleware): void {
		if (pipeline === 'TOOL') {
			this.toolChain.use(middleware);
		} else if (pipeline === 'MUTATION') {
			this.mutationChain.use(middleware);
		}
	}

	/**
	 * 核心循環
	 * 調用調度器填充隊列，並模擬並行執行就緒任務。
	 */
	async asyncTick(): Promise<void> {
		// 1. 調用調度器，根據 TaskGraph 狀態填充 ReadyQueue
		this.scheduler.schedule(this.taskGraph, this.readyQueue);

		// 2. 從 ReadyQueue 中取出所有當前就緒的任務
		const tasksToExecute: string[] = [];
		let taskId: string | null;
		while ((taskId = this.readyQueue.pop()) !== null) {
			tasksToExecute.push(taskId);
		}

		// 3. 執行任務 (目前採順序執行以確保錯誤時能立即中斷並回滾)
		// TODO: 未來可引入並行執行與取消機制以優化性能
		for (const id of tasksToExecute) {
			// 如果已經在處理失敗（例如上一個任務剛失敗），則停止批次處理
			if (this.status === 'ERROR') {
				break;
			}

			logger.info(`Executing task: ${id}`, { session_id: this.id, type: 'LIFECYCLE' });
			this.scheduler.onTaskStarted(id);

			const taskNode = this.taskGraph.getTask(id);
			if (!taskNode) {
				logger.error(`Task node ${id} not found in graph during execution.`, { session_id: this.id, type: 'SYSTEM' });
				continue;
			}

			try {
				// ... (rest of the try block)
				// 收集依賴任務的結果作為上下文
				const parentContext: Record<string, any> = {};
				if (taskNode.dependencies && taskNode.dependencies.length > 0) {
					for (const depId of taskNode.dependencies) {
						if (this.taskResults.has(depId)) {
							parentContext[depId] = this.taskResults.get(depId);
						}
					}
				}

				// 將上下文注入 metadata
				taskNode.metadata = {
					...(taskNode.metadata || {}),
					parentContext,
					sessionGoal: this.goal // 同步傳遞會話總體目標
				};

				await this.toolChain.execute(
					{
						session_id: this.id,
						target: id,
						data: taskNode.metadata,
						metadata: taskNode
					},
					async () => {
						// 中間件鏈結點：執行實際的 Agent 委派
						if (this.agentRegistry) {
							const assignedId = taskNode.assignedAgentId;
							const assignedRole = taskNode.assignedRole || 'default';

							// 優先級：1. 指定 ID, 2. 指定 Role, 3. 預設 Role, 4. 系統 Default Worker
							let agent = assignedId ? this.agentRegistry.getAgent(assignedId) : undefined;
							
							// 檢查指定 Agent 是否就緒
							if (agent && !agent.isReady()) {
							  logger.warn(`Agent ${agent.id} found but not ready. Searching for alternatives.`, { session_id: this.id, type: 'SYSTEM' });
							  agent = undefined;
							}

							if (!agent) {
							  const allAgents = this.agentRegistry.getAllAgents().filter(a => a.isReady());
							  logger.info(`Searching for ready agent with role: "${assignedRole}".`, { session_id: this.id, type: 'SYSTEM', payload: { available: allAgents.map(a => a.id) } });
							  agent = allAgents.find(a => a.role.toLowerCase() === assignedRole.toLowerCase());
							}

							if (!agent) {
								try {
									agent = await this.agentRegistry.ensureDefaultWorker();
									if (agent && !agent.isReady()) {
									  logger.error(`Default worker ${agent.id} is not ready.`, { session_id: this.id, type: 'SYSTEM' });
									  agent = undefined;
									} else {
									  logger.info(`Using fallback default worker: ${agent?.id} for task ${id}`, { session_id: this.id, type: 'SYSTEM' });
									}
								} catch (e) {
									logger.warn(`Failed to get default worker: ${(e as Error).message}`, { session_id: this.id, type: 'SYSTEM' });
								}
							}

							if (agent && 'processTask' in agent) {
							  logger.info(`Delegating task ${id} to agent ${agent.id} (role: ${agent.role})`, { session_id: this.id, type: 'LIFECYCLE', agent_id: agent.id });
							  const result = await (agent as any).processTask(taskNode);
							  
							  // 保存執行結果
							  taskNode.result = result;
							  this.taskResults.set(id, result);
							  taskNode.status = 'completed';
							} else {
							  logger.warn(`No suitable worker agent found for ID: ${assignedId} or Role: ${assignedRole}.`, { session_id: this.id, type: 'SYSTEM' });
							}


						}
						logger.info(`Tool execution completed for task: ${id}`, { session_id: this.id, type: 'TOOL' });
					}
				);

				// 任務成功完成
				await this.onTaskSuccess(id);
			} catch (error) {
				// 標記會話狀態為 ERROR，防止 batch 繼續執行
				this.status = 'ERROR';
				// 任務失敗
				await this.onTaskFailure(id, error);
				throw error; // 重新拋出以讓 tick() 捕捉
			}
		}
	}

	private isTicking: boolean = false;

	/**
	 * 核心循環 (同步包裝器，保持接口一致性，但內部支持並發)
	 */
	async tick(): Promise<void> {
		if (this.isTicking) {
			return;
		}
		this.isTicking = true;
		try {
			await this.asyncTick();
		} finally {
			this.isTicking = false;
		}
	}

	/**
	 * 處理任務成功完成
	 */
	private async onTaskSuccess(taskId: string): Promise<void> {
		// 1. 更新調度器與 TaskGraph
		this.scheduler.onTaskCompleted(taskId, this.taskGraph, this.readyQueue);
		this.completedTaskCount++;

		// 2. 自動觸發快照
		if (this.snapshotManager) {
			logger.info(`Task ${taskId} completed. Triggering snapshot...`, { session_id: this.id, type: 'LIFECYCLE' });
			await this.snapshotManager.snapshot(this, {
				lastTaskId: taskId,
				taskIndex: this.completedTaskCount
			});
		}
	}

	/**
	 * 處理任務失敗
	 */
	private async onTaskFailure(taskId: string, error: any): Promise<void> {
		logger.error(`Task ${taskId} failed: ${error}`, { session_id: this.id, type: 'LIFECYCLE', payload: error });
		this.scheduler.onTaskFailed(taskId, this.taskGraph, this.readyQueue);

		// 1. 嘗試進行自適應重新規劃
		if (this.agentRegistry) {
			const coordinators = this.agentRegistry.getAgentByRole('COORDINATOR') as ICoordinator[];
			const coordinator = (coordinators && coordinators.length > 0) ? coordinators[0] : undefined;
			if (coordinator && 'requestReplan' in coordinator) {
				try {
					logger.info(`Triggering adaptive replanning for task ${taskId}...`, { session_id: this.id, type: 'PLAN' });

					const errorMessage = error instanceof Error ? error.message : String(error);

					// 獲寫當前所有可用的 Agent 資訊以供重新規劃
					const availableAgents = this.agentRegistry.getAllAgents().filter(a => a.isReady());

					// 構建當前狀態 (IAgentState 的基礎版本)
					const currentState = {
						goal: this.goal,
						currentTask: taskId,
						planning: {
							taskGraph: this.taskGraph.toJSON()
						},
						errors: [errorMessage],
						metadata: {
						  available_agents: availableAgents.map(a => ({
						    id: a.id,
						    role: a.role,
						    capabilities: a.capabilities || []
						  }))
						}
					};

					const newGraph = await coordinator.requestReplan(
						this.goal,
						taskId,
						errorMessage,
						currentState as any
					);

					if (newGraph) {
						logger.info(`Replanning successful. Loading new task graph.`, { session_id: this.id, type: 'PLAN' });
						await this.loadFromJSON({ taskGraph: newGraph });
						return; // 重新規劃成功，跳過回滾
					}
				} catch (replanError) {
					logger.warn(`Adaptive replanning failed: ${replanError}`, { session_id: this.id, type: 'PLAN' });
					// 繼續執行回滾邏輯
				}
			}
		}

		// 2. 如果重新規劃不可用或失敗，則執行標準回滾
		// 如果有 SnapshotManager，嘗試執行回滾到上一個成功狀態
		if (this.snapshotManager) {
			const lastSuccessful = await this.snapshotManager.getLatestSnapshotId(this.id);
			if (lastSuccessful) {
				logger.info(`Rolling back to last successful snapshot: ${lastSuccessful}`, { session_id: this.id, type: 'LIFECYCLE' });
				await this.rollback(lastSuccessful);
			}
		}
	}

	async exportLog(): Promise<string> {
		return "";
	}

	toJSON(): Record<string, any> {
		const agentsData: Record<string, any> = {};
		if (this.agentRegistry) {
			for (const aid of this.agentIds) {
				const agent = this.agentRegistry.getAgent(aid);
				if (agent) {
					agentsData[aid] = agent.toJSON();
				}
			}
		}

		return {
			id: this.id,
			goal: this.goal,
			status: this.status,
			taskGraph: this.taskGraph.toJSON(),
			agentIds: this.agentIds,
			agents: agentsData, // 快照時保存 Agent 狀態
			completedTaskCount: this.completedTaskCount
		};
	}

	async loadFromJSON(data: Record<string, any>): Promise<void> {
		this.id = data.id || this.id;
		this.goal = data.goal || this.goal;
		this.status = data.status || this.status;
		this.agentIds = data.agentIds || [];
		this.completedTaskCount = data.completedTaskCount || 0;

		if (data.taskGraph) {
			this.taskGraph.loadFromJSON(data.taskGraph);
		}

		// 恢復 Agent 狀態
		if (data.agents && this.agentRegistry) {
			for (const [aid, agentData] of Object.entries(data.agents)) {
				let agent = this.agentRegistry.getAgent(aid);
				if (!agent) {
					logger.warn(`Agent ${aid} not found in registry during load.`, { session_id: this.id, type: 'SYSTEM' });
				} else {
					await agent.initFromJSON(agentData as Record<string, any>);
				}
			}
		}

		// 重新填充 ReadyQueue
		this.readyQueue.clear();
		this.scheduler.reset();
		this.scheduler.schedule(this.taskGraph, this.readyQueue);
	}

	async snapshot(): Promise<string> {
		if (!this.snapshotManager) {
			throw new Error("SnapshotManager not configured for this session.");
		}
		return await this.snapshotManager.snapshot(this, {
			manual: true,
			taskIndex: this.completedTaskCount
		});
	}

	async rollback(checkpointId: string): Promise<void> {
		if (!this.snapshotManager) {
			throw new Error("SnapshotManager not configured for this session.");
		}
		logger.info(`Rolling back to ${checkpointId}`, { session_id: this.id, type: 'LIFECYCLE' });
		await this.snapshotManager.rollback(this, checkpointId);
		// 狀態恢復邏輯已在 loadFromJSON 中處理 (包含 ReadyQueue 的重新填充)
	}
}
