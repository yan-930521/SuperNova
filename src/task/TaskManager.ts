import { v4 as uuidv4 } from 'uuid';

import { AgentRegistry } from '../infra/AgentRegistry';
import { recorder } from '../infra/LogManager';
import { AgentState } from '../models/AgentState';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { TaskGraph } from '../session/TaskGraph';
import { TaskPlanner } from './TaskPlanner';
import {
    ChainStatus, IChainStatusSummary, ITaskChainState, ITaskRequest, LogType, SystemEvent, TaskNode,
    TaskStatus
} from './types';

/**
 * TaskManager (任務管理器)
 * 負責協調任務的規劃與並行執行流程。
 */
export class TaskManager {
	private inbox: ITaskRequest[] = [];
	private chains = new Map<string, ITaskChainState>();
	private planner: TaskPlanner;

	constructor(private agentRegistry: AgentRegistry) {
		this.planner = new TaskPlanner();
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
	createChain(goal: string, sessionId: string, requesterId: string): string {
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
	 * 向指定鏈中新增任務
	 */
	addTaskToChain(chainId: string, taskData: Partial<TaskNode>): string {
		const chain = this.chains.get(chainId);
		if (!chain) throw new Error(`Chain ${chainId} not found.`);

		const taskId = taskData.id || `task-${uuidv4().substring(0, 8)}`;
		const node: TaskNode = {
			id: taskId,
			type: taskData.type || 'work',
			goal: taskData.goal || 'No goal',
			dependencies: taskData.dependencies || [],
			status: TaskStatus.PENDING,
			assignedAgentId: taskData.assignedAgentId
		};

		chain.graph.addTask(taskId, node);

		// 建立依賴
		node.dependencies.forEach(depId => {
			try { chain.graph.addDependency(depId, taskId); } catch (e) { }
		});

		recorder.info(`[TaskManager] Task ${taskId} added to ${chainId}`, { type: LogType.LIFECYCLE });

		// 觸發執行
		this.driveExecution(chainId).catch(() => { });
		return taskId;
	}

	/**
	 * 手動指派任務
	 */
	assignTask(chainId: string, taskId: string, agentId: string): void {
		const chain = this.chains.get(chainId);
		if (!chain) throw new Error(`Chain ${chainId} not found.`);

		const task = chain.graph.getTask(taskId);
		if (!task) throw new Error(`Task ${taskId} not found in ${chainId}.`);

		task.assignedAgentId = agentId;
		recorder.info(`[TaskManager] Task ${taskId} assigned to ${agentId}`, { type: LogType.LIFECYCLE });

		this.driveExecution(chainId).catch(() => { });
	}

	// --- 查詢介面 ---

	listChains(): IChainStatusSummary[] {
		return Array.from(this.chains.entries()).map(([chainId, state]) => ({
			chainId,
			status: state.status,
			nodes: state.graph.getAllTasks(),
			sessionId: state.sessionId,
			goal: state.goal
		}));
	}

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

	getChainTasks(chainId: string): TaskNode[] {
		return this.chains.get(chainId)?.graph.getAllTasks() || [];
	}

	getTaskInfo(chainId: string, taskId: string): TaskNode | null {
		return this.chains.get(chainId)?.graph.getTask(taskId) || null;
	}

	// --- 內部核心邏輯 ---

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
			const agents = this.agentRegistry.getAllAgents().map(a => ({ id: a.id, role: a.role, capabilities: a.capabilities }));
			const initialState = this.createInitialState(request.goal, agents, request.sessionId, request.traceId);
			const finalState = await this.planner.run(initialState);

			if (!finalState.planning?.taskGraph) throw new Error("Planning produced no graph.");

			const nodes = finalState.planning.taskGraph.nodes;
			nodes.forEach(n => graph.addTask(n.id, n));
			nodes.forEach(n => n.dependencies.forEach(d => { try { graph.addDependency(d, n.id); } catch (e) { } }));

			const chain = this.chains.get(request.chainId)!;
			chain.status = ChainStatus.RUNNING;

			GlobalRuntime.getInstance().eventBus.publish({
				type: SystemEvent.SESSION_START,
				session_id: request.sessionId,
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
			if (allTasks.length > 0 && allTasks.every(n => n.status === TaskStatus.COMPLETED)) {
				chain.status = ChainStatus.COMPLETED;
				recorder.info(`[TaskManager] Chain ${chainId} completed.`);
			}
			return;
		}

		await Promise.all(readyTasks.map(tid => this.executeNode(chainId, tid)));
		await this.driveExecution(chainId);
	}

	private async executeNode(chainId: string, taskId: string) {
		const chain = this.chains.get(chainId)!;
		const node = chain.graph.getTask(taskId)!;

		node.status = TaskStatus.RUNNING;
		recorder.info(`[TaskManager] Executing: ${taskId} (${node.goal})`, { session_id: chain.sessionId });

		try {
			const agent = this.agentRegistry.getAgent(node.assignedAgentId || 'default-worker');
			if (!agent) {
				throw new Error(`Agent ${node.assignedAgentId || 'default-worker'} not found.`);
			}

			// 統一調用 execute，不論是 MainAgent 還是 WorkerAgent
			const executeResult = await agent.execute(node.goal, { 
				sessionId: chain.sessionId,
				traceId: chain.traceId,
				agentId: agent.id,
				taskId: taskId,
				sessionGoal: chain.goal
			});
			
			node.result = executeResult.result;
			
			if (executeResult.status === 'failed') {
				throw new Error(executeResult.error || 'Agent execution failed');
			}

			// 發布摘要到會話總帳
			GlobalRuntime.getInstance().eventBus.publish({
				type: SystemEvent.ACTION_SUMMARY,
				session_id: chain.sessionId,
				payload: { taskId, summary: executeResult.summary },
				timestamp: Date.now()
			});

			node.status = TaskStatus.COMPLETED;
			chain.graph.completeTask(taskId);
		} catch (err: any) {
			await this.handleNodeFailure(chainId, taskId, err.message);
		}
	}

	private async handleNodeFailure(chainId: string, taskId: string, error: string) {
		recorder.error(`[TaskManager] Task ${taskId} failed in chain ${chainId}: ${error}`);
		const chain = this.chains.get(chainId)!;
		const node = chain.graph.getTask(taskId);
		if (node) {
			node.status = TaskStatus.FAILED;
		}
		chain.status = ChainStatus.FAILED;
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
