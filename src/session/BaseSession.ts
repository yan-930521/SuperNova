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
		// console.log(`Session ${this.id} ticking...`);

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
			console.log(`[BaseSession] Executing task: ${id}`);
			this.scheduler.onTaskStarted(id);

			const taskNode = this.taskGraph.getTask(id);
			if (!taskNode) {
				console.error(`[BaseSession] Task node ${id} not found in graph during execution.`);
				continue;
			}

			try {
				await this.toolChain.execute(
					{
						session_id: this.id,
						target: id,
						data: taskNode.metadata || {}, // 使用 metadata 擴充數據
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
							  console.warn(`[BaseSession] Agent ${agent.id} found but not ready. Searching for alternatives.`);
							  agent = undefined;
							}

							if (!agent) {
							  const allAgents = this.agentRegistry.getAllAgents().filter(a => a.isReady());
							  console.log(`[BaseSession] Searching for ready agent with role: "${assignedRole}". Available ready agents: ${JSON.stringify(allAgents.map(a => ({ id: a.id, role: a.role })))}`);
							  agent = allAgents.find(a => a.role.toLowerCase() === assignedRole.toLowerCase());
							}

							if (!agent) {
								try {
									agent = await this.agentRegistry.ensureDefaultWorker();
									if (agent && !agent.isReady()) {
									  console.error(`[BaseSession] Default worker ${agent.id} is not ready.`);
									  agent = undefined;
									} else {
									  console.log(`[BaseSession] Using fallback default worker: ${agent?.id} for task ${id}`);
									}
								} catch (e) {
									console.warn(`[BaseSession] Failed to get default worker: ${(e as Error).message}`);
								}
							}

							if (agent && 'processTask' in agent) {
							  console.log(`[BaseSession] Delegating task ${id} to agent ${agent.id} (role: ${agent.role})`);
							  await (agent as any).processTask(taskNode);
							} else {
							  console.warn(`[BaseSession] No suitable worker agent found for ID: ${assignedId} or Role: ${assignedRole}.`);
							}


						}
						console.log(`[BaseSession] Tool execution completed for task: ${id}`);
					}
				);

				// 任務成功完成
				await this.onTaskSuccess(id);
			} catch (error) {
				// 任務失敗
				await this.onTaskFailure(id, error);
				throw error; // 重新拋出以讓 tick() 捕捉
			}
		}
	}

	/**
	 * 核心循環 (同步包裝器，保持接口一致性，但內部支持並發)
	 */
	async tick(): Promise<void> {
		await this.asyncTick();
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
			console.log(`[BaseSession] Task ${taskId} completed. Triggering snapshot...`);
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
		console.error(`[BaseSession] Task ${taskId} failed:`, error);
		this.scheduler.onTaskFailed(taskId, this.taskGraph, this.readyQueue);

		// 1. 嘗試進行自適應重新規劃
		if (this.agentRegistry) {
			const coordinators = this.agentRegistry.getAgentByRole('COORDINATOR') as ICoordinator[];
			const coordinator = (coordinators && coordinators.length > 0) ? coordinators[0] : undefined;
			if (coordinator && 'requestReplan' in coordinator) {
				try {
					console.log(`[BaseSession] Triggering adaptive replanning for task ${taskId}...`);

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
						console.log(`[BaseSession] Replanning successful. Loading new task graph.`);
						await this.loadFromJSON({ taskGraph: newGraph });
						return; // 重新規劃成功，跳過回滾
					}
				} catch (replanError) {
					console.warn(`[BaseSession] Adaptive replanning failed:`, replanError);
					// 繼續執行回滾邏輯
				}
			}
		}

		// 2. 如果重新規劃不可用或失敗，則執行標準回滾
		// 如果有 SnapshotManager，嘗試執行回滾到上一個成功狀態
		if (this.snapshotManager) {
			const lastSuccessful = await this.snapshotManager.getLatestSnapshotId(this.id);
			if (lastSuccessful) {
				console.log(`[BaseSession] Rolling back to last successful snapshot: ${lastSuccessful}`);
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
					console.warn(`[BaseSession] Agent ${aid} not found in registry during load.`);
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
		console.log(`[BaseSession] Rolling back to ${checkpointId}`);
		await this.snapshotManager.rollback(this, checkpointId);
		// 狀態恢復邏輯已在 loadFromJSON 中處理 (包含 ReadyQueue 的重新填充)
	}
}
