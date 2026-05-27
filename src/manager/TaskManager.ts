import { v4 as uuidv4 } from 'uuid';

import { recorder } from '../infra/LogManager';
import { SystemEventType } from '../infra/types/events';
import {
    ChainStatus, IChainStatusSummary, ITaskRepository, ITaskRequest, LogType, TaskStatus
} from '../infra/types/task';
import { AgentState } from '../models/AgentState';
import { Task } from '../models/Task';
import { TaskGraph } from '../models/TaskGraph';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { TaskPlanner } from '../task/TaskPlanner';
import { AgentManager } from './AgentManager';

/**
 * 任務鏈運行時狀態介面 (用於 TaskManager 追蹤)
 */
export interface ITaskChainState {
  status: ChainStatus;
  graph: TaskGraph; 
  sessionId: string;
  traceId: string;
  goal: string;
  milestones?: string[];
  currentMilestoneIdx?: number;
  projectedContext?: any;
}

/**
 * TaskManager (任務管理器)
 * 負責協調任務的規劃與並行執行流程，並透過 ITaskRepository 實現狀態持久化。
 */
export class TaskManager {

	private inbox: ITaskRequest[] = [];
	private chains = new Map<string, ITaskChainState>();
	private activeTasks = new Map<string, Task>(); // 內存中的任務實體緩存
	private planner: TaskPlanner;

	constructor(
		private agentManager: AgentManager,
		private repo: ITaskRepository
	) {
		this.planner = new TaskPlanner();
		this.setupHeartbeatListener();
		this.setupTaskFailureListener();
	}

	// --- 公開管理介面 (API) ---

	/**
	 * 提交一個新的任務目標 (自動化規劃流程)
	 */
	async submit(goal: string, sessionId: string, requesterId: string): Promise<{ chainId: string; traceId: string }> {
		const chainId = `chain-${Date.now()}`;
		const traceId = `trace-${Date.now()}`;

		this.inbox.push({ goal, sessionId, chainId, traceId, requesterId });

		recorder.info(`[TaskManager] Task submitted by ${requesterId}: ${chainId}`, {
			type: LogType.LIFECYCLE,
			trace_id: traceId,
			session_id: sessionId,
			payload: { goal, chainId, requesterId }
		});

		this.processInbox().catch(err => {
			recorder.error(`[TaskManager] Process inbox failed: ${err.message}`, { trace_id: traceId });
		});

		return { chainId, traceId };
	}

	/**
	 * 手動建立一個任務鏈 (用於對話式操控)
	 */
	async createChain(goal: string, sessionId: string, requesterId: string): Promise<string> {
		const chainId = `chain-manual-${Date.now()}`;
		const graph = new TaskGraph();

		this.chains.set(chainId, {
			status: ChainStatus.RUNNING,
			graph,
			sessionId,
			traceId: `trace-man-${Date.now()}`,
			goal
		});

		recorder.info(`[TaskManager] Manual chain created by ${requesterId}: ${chainId}`, { type: LogType.LIFECYCLE, session_id: sessionId });
		return chainId;
	}

	/**
	 * 向指定鏈中新增任務並持久化
	 */
	async addTaskToChain(chainId: string, taskData: any): Promise<string> {
		const chain = this.chains.get(chainId);
		if (!chain) throw new Error(`Chain ${chainId} not found.`);

		const taskId = taskData.id || `task-${uuidv4().substring(0, 8)}`;
		const task = new Task({
			...taskData,
			id: taskId,
			sessionId: chain.sessionId,
			status: 'pending'
		});

		// 1. 存入儲存庫
		await this.repo.save(task.toDTO());
		
		// 2. 更新任務圖 (保持舊有圖邏輯)
		chain.graph.addTask(taskId, task.toDTO() as any);
		this.activeTasks.set(taskId, task);

		// 建立依賴
		if (taskData.dependencies && Array.isArray(taskData.dependencies)) {
			taskData.dependencies.forEach((depId: string) => {
				try { chain.graph.addDependency(depId, taskId); } catch (e) { }
			});
		}

		recorder.info(`[TaskManager] Task ${taskId} added and persisted.`, { type: LogType.LIFECYCLE });
		
		this.driveExecution(chainId).catch(() => { });
		return taskId;
	}

	/**
	 * 手動指派任務
	 */
	async assignTask(chainId: string, taskId: string, agentId: string): Promise<void> {
		const chain = this.chains.get(chainId);
		if (!chain) throw new Error(`Chain ${chainId} not found.`);

		const task = this.activeTasks.get(taskId);
		if (!task) throw new Error(`Task ${taskId} not found in memory.`);

		task.assignedAgentId = agentId;
		await this.repo.save(task.toDTO());
		
		// 同步更新圖中的節點資料
		const graphTask = chain.graph.getTask(taskId);
		if (graphTask) graphTask.assignedAgentId = agentId;

		recorder.info(`[TaskManager] Task ${taskId} assigned to ${agentId}`, { type: LogType.LIFECYCLE });

		this.driveExecution(chainId).catch(() => { });
	}

	/**
	 * 列出所有當前的任務鏈
	 */
	listChains(): IChainStatusSummary[] {
		return Array.from(this.chains.entries()).map(([chainId, state]) => ({
			chainId,
			status: state.status,
			nodes: state.graph.getAllTasks(),
			sessionId: state.sessionId,
			goal: state.goal
		}));
	}

	/**
	 * 獲取指定鏈的狀態摘要
	 */
	getChainStatus(chainId: string): IChainStatusSummary | null {
		const state = this.chains.get(chainId);
		if (!state) return null;
		return {
			chainId,
			status: state.status,
			nodes: state.graph.getAllTasks(),
			sessionId: state.sessionId,
			goal: state.goal
		};
	}

	/**
	 * 獲取指定鏈中的所有任務
	 */
	getChainTasks(chainId: string): any[] {
		return this.chains.get(chainId)?.graph.getAllTasks() || [];
	}

	/**
	 * 獲取特定任務的詳細資訊
	 */
	getTaskInfo(chainId: string, taskId: string): Task | null {
		// 先看內存
		if (this.activeTasks.has(taskId)) {
			return this.activeTasks.get(taskId)!;
		}
		return null;
	}

	// --- 核心執行邏輯 ---

	private async processInbox() {
		if (this.inbox.length === 0) return;
		const request = this.inbox.shift()!;

		const graph = new TaskGraph();
		this.chains.set(request.chainId, {
			status: ChainStatus.PLANNING,
			graph,
			sessionId: request.sessionId,
			traceId: request.traceId,
			goal: request.goal
		});

		try {
			const agents = this.agentManager.getAllAgents().map(a => ({ id: a.id, role: a.role, capabilities: a.capabilities }));
			const initialState = this.createInitialState(request.goal, agents, request.sessionId, request.traceId);
			const finalState = await this.planner.run(initialState);

			if (!finalState.planning?.taskGraph) throw new Error("Planning produced no graph.");

			const nodes = finalState.planning.taskGraph.nodes;
			for (const n of nodes) {
				const task = new Task({ ...n, sessionId: request.sessionId });
				await this.repo.save(task.toDTO());
				graph.addTask(n.id, n);
				this.activeTasks.set(n.id, task);
			}

			const chain = this.chains.get(request.chainId)!;
			chain.status = ChainStatus.RUNNING;
			
			// 存儲 JIT 需要的狀態
			chain.milestones = finalState.planning?.milestones;
			chain.currentMilestoneIdx = finalState.planning?.currentMilestoneIdx;
			chain.projectedContext = finalState.planning?.projectedContext;

			GlobalRuntime.getInstance().eventBus.publish({
				type: SystemEventType.SESSION_CREATED,
				userId: 'system',
				sessionId: request.sessionId,
				payload: { goal: request.goal, nodes: graph.getAllTasks() },
				timestamp: Date.now()
			});

			await this.driveExecution(request.chainId);
		} catch (error: any) {
			recorder.error(`[TaskManager] Planning failed: ${error.message}`);
			const chain = this.chains.get(request.chainId);
			if (chain) chain.status = ChainStatus.FAILED;
		}
	}

	private async driveExecution(chainId: string) {
		const chain = this.chains.get(chainId);
		if (!chain || chain.status !== ChainStatus.RUNNING) return;

		const readyTasks = chain.graph.getReadyTasks();
		if (readyTasks.length === 0) {
			const allTasks = chain.graph.getAllTasks();
			const isInitialAndEmpty = allTasks.length === 0 && chain.milestones && chain.milestones.length > 0;
			const isMilestoneCompleted = allTasks.length > 0 && allTasks.every((n: any) => n.status === TaskStatus.COMPLETED);

			if (isInitialAndEmpty || isMilestoneCompleted) {
				const nextIdx = isInitialAndEmpty ? (chain.currentMilestoneIdx ?? 0) : (chain.currentMilestoneIdx ?? 0) + 1;
				
				if (chain.milestones && nextIdx < chain.milestones.length) {
					await this.expandMilestone(chainId, nextIdx);
				} else {
					chain.status = ChainStatus.COMPLETED;
					recorder.info(`[TaskManager] Chain ${chainId} completed.`);
				}
			}
			return;
		}

		await Promise.all(readyTasks.map((tid: string) => this.executeNode(chainId, tid)));
		await this.driveExecution(chainId);
	}

	private async expandMilestone(chainId: string, milestoneIdx: number) {
		const chain = this.chains.get(chainId)!;
		const agents = this.agentManager.getAllAgents().map(a => ({ id: a.id, role: a.role, capabilities: a.capabilities }));
		
		chain.currentMilestoneIdx = milestoneIdx;
		
		recorder.info(`[TaskManager] Expanding milestone ${chain.currentMilestoneIdx + 1}/${chain.milestones?.length}`, { type: LogType.PLAN });

		const currentState: AgentState = {
			goal: chain.goal,
			currentTask: "",
			messages: [],
			thoughtTree: { nodes: [], rootId: null, activeNodeId: null, iterationCount: 0 },
			planning: { 
				milestones: chain.milestones || [], 
				currentMilestoneIdx: chain.currentMilestoneIdx, 
				taskGraph: (chain.graph as any).toJSON ? (chain.graph as any).toJSON() : { nodes: chain.graph.getAllTasks(), edges: [] }, 
				projectedContext: chain.projectedContext || {} 
			},
			lastEvaluations: [],
			errors: [],
			metadata: { available_agents: agents, sessionId: chain.sessionId, traceId: chain.traceId }
		};

		const finalState = await this.planner.expandMilestone(currentState as any);
		
		if (!finalState.planning?.taskGraph) throw new Error("Milestone expansion produced no graph.");

		const newNodes = finalState.planning.taskGraph.nodes.filter(n => !chain.graph.getTask(n.id));
		for (const n of newNodes) {
			const task = new Task({ ...n, sessionId: chain.sessionId });
			await this.repo.save(task.toDTO());
			chain.graph.addTask(n.id, n);
			this.activeTasks.set(n.id, task);
		}

		// 同步更新里程碑索引（以 planner 返回的為準，如果有變化的話）
		if (finalState.planning.currentMilestoneIdx !== undefined) {
			chain.currentMilestoneIdx = finalState.planning.currentMilestoneIdx;
		}

		await this.driveExecution(chainId);
	}

	private async executeNode(chainId: string, taskId: string) {
		const chain = this.chains.get(chainId)!;
		const task = this.activeTasks.get(taskId);
		if (!task) return;

		task.updateStatus(TaskStatus.RUNNING);
		await this.repo.save(task.toDTO());

		recorder.info(`[TaskManager] Executing: ${taskId} (${task.goal})`, { session_id: chain.sessionId });

		const runtime = GlobalRuntime.getInstance();
		try {
			// 開始監控任務
			runtime.pulseEngine.watchTask(taskId);

			const agent = this.agentManager.getAgent(task.assignedAgentId || 'default-worker');
			if (!agent) throw new Error(`Agent ${task.assignedAgentId} not found.`);

			const executeResult = await agent.execute(task.goal, { 
				sessionId: chain.sessionId,
				traceId: chain.traceId,
				agentId: agent.id,
				taskId: taskId,
				sessionGoal: chain.goal
			});
			
			if (executeResult.status === 'failed') throw new Error(executeResult.error);

			task.setResult(executeResult.result);
			await this.repo.save(task.toDTO());

			chain.graph.completeTask(taskId);
		} catch (err: any) {
			task.fail(err.message);
			await this.repo.save(task.toDTO());
			chain.status = ChainStatus.FAILED;
		} finally {
			// 停止監控任務
			runtime.pulseEngine.unwatchTask(taskId);
		}
	}

	private setupHeartbeatListener() {
		const runtime = GlobalRuntime.getInstance();
		if (runtime && runtime.eventBus) {
			runtime.eventBus.subscribe(SystemEventType.TASK_HEARTBEAT, (event) => {
				const { taskId } = event.payload;
				if (taskId) {
					runtime.pulseEngine.updateHeartbeat(taskId);
				}
			});
		}
	}

	private setupTaskFailureListener() {
		const runtime = GlobalRuntime.getInstance();
		if (runtime && runtime.eventBus) {
			runtime.eventBus.subscribe(SystemEventType.TASK_FAILED, (event) => {
				const { taskId, error } = event.payload;
				if (error?.includes('timeout')) {
					this.handleTaskFailure(taskId, error);
				}
			});
		}
	}

	private async handleTaskFailure(taskId: string, error: string) {
		const task = this.activeTasks.get(taskId);
		if (!task) return;

		recorder.error(`[TaskManager] Task ${taskId} failed: ${error}`);

		task.fail(error);
		await this.repo.save(task.toDTO());

		const chainId = this.findChainIdByTaskId(taskId);
		if (chainId) {
			const chain = this.chains.get(chainId);
			if (chain) {
				chain.status = ChainStatus.FAILED;
				recorder.error(`[TaskManager] Chain ${chainId} marked as FAILED due to task failure.`);
			}
		}
	}

	private findChainIdByTaskId(taskId: string): string | null {
		for (const [chainId, state] of this.chains.entries()) {
			if (state.graph.getTask(taskId)) {
				return chainId;
			}
		}
		return null;
	}

	private createInitialState(goal: string, agents: any[], sessionId: string, traceId: string): AgentState {
		return {
			goal,
			currentTask: "",
			messages: [],
			thoughtTree: { nodes: [], rootId: null, activeNodeId: null, iterationCount: 0 },
			planning: { milestones: [], currentMilestoneIdx: 0, taskGraph: null, projectedContext: {} },
			lastEvaluations: [],
			errors: [],
			metadata: { available_agents: agents, sessionId, traceId }
		};
	}
}
