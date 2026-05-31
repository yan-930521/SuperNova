import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { MainAgent } from '../agent/MainAgent';
import { recorder } from '../infra/LogManager';
import { InferenceEngine } from '../infra/ModelRegistry';
import { ModelPreset } from '../infra/types/agent';
import {
    IChainCreatedPayload, IChainStatusUpdatedPayload, ITaskCompletedPayload, ITaskFailedPayload,
    ITaskHeartbeatPayload, ITaskStatusUpdatedPayload, SystemEventType
} from '../infra/types/events';
import { MessageRole } from '../infra/types/session';
import {
    ChainStatus, IChainStatusSummary, ITaskRequest, LogType, TaskDTO, TaskStatus
} from '../infra/types/task';
import { Task } from '../models/Task';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { TodoListResponseSchema } from '../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../utils/PromptLoader';
import { BaseManager } from './BaseManager';

/**
 * 任務鏈運行時狀態介面 (用於 TaskManager 追蹤)
 */
export interface ITaskChainState {
	status: ChainStatus;
	tasks: TaskDTO[]; // 改為扁平的任務清單
	sessionId: string;
	traceId: string;
	goal: string;
	requesterId: string;
	planningDocument?: string; // 詳細規劃文本
	replanCount?: number;
}

/**
 * TaskManager (任務管理器) - TodoList 版
 * 負責協調任務的規劃與並行執行流程。
 * 核心邏輯：單次全局規劃產出 TodoList，透過狀態掃描驅動執行。
 */
export class TaskManager extends BaseManager {

	private inbox: ITaskRequest[] = [];
	private chains = new Map<string, ITaskChainState>();
	private activeTasks = new Map<string, Task>(); // 內存中的任務實體緩存

	private planner!: InferenceEngine;

	constructor() {
		super();
	}

	/**
	 * 當 Runtime 注入後，設置監聽器
	 */
	protected onRuntimeInjected(): void {
		this.setupHeartbeatListener();
		this.setupTaskFailureListener();
		this.setupChainListener();

		const smartModel = this.runtime.modelRegistry.getModel(ModelPreset.SMART);

		this.planner = smartModel.withSystemPrompt(
			PromptLoader.load('planning/plan_todolist.md', 'Plan tasks for: {goal}')
		)
	}

	// --- 公開管理介面 (API) ---

	/**
	 * 提交一個新的任務目標 (自動化規劃流程)
	 */
	async submit(goal: string, description: string, sessionId: string, requesterId: string): Promise<{ chainId: string; traceId: string }> {
		const chainId = `chain-${Date.now()}`;
		const traceId = `trace-${Date.now()}`;

		this.inbox.push({ goal, description, sessionId, chainId, traceId, requesterId });

		recorder.info(`[TaskManager] Task submitted by ${requesterId}: ${chainId}`, {
			type: LogType.LIFECYCLE,
			trace_id: traceId,
			session_id: sessionId,
			payload: { goal, description, chainId, requesterId }
		});

		this.processInbox().catch(err => {
			recorder.error(`[TaskManager] Process inbox failed: ${err.message}`, { trace_id: traceId });
		});

		return { chainId, traceId };
	}

	/**
	 * 列出所有當前的任務鏈
	 */
	listChains(): IChainStatusSummary[] {
		return Array.from(this.chains.entries()).map(([chainId, state]) => ({
			chainId,
			status: state.status,
			nodes: state.tasks,
			sessionId: state.sessionId,
			goal: state.goal,
			planningDocument: state.planningDocument
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
			nodes: state.tasks,
			sessionId: state.sessionId,
			goal: state.goal,
			planningDocument: state.planningDocument
		};
	}

	/**
	 * 獲取指定鏈中的所有任務
	 */
	getChainTasks(chainId: string): TaskDTO[] {
		return this.chains.get(chainId)?.tasks || [];
	}

	/**
	 * 手動建立一個任務鏈 (用於對話式操控)
	 */
	async createChain(goal: string, sessionId: string, requesterId: string): Promise<string> {
		const chainId = `chain-manual-${Date.now()}`;
		this.chains.set(chainId, {
			status: ChainStatus.RUNNING,
			tasks: [],
			sessionId,
			traceId: `trace-man-${Date.now()}`,
			goal,
			requesterId
		});

		this.updateChainStatus(chainId, ChainStatus.RUNNING);
		recorder.info(`[TaskManager] Manual chain created by ${requesterId}: ${chainId}`, { type: LogType.LIFECYCLE, session_id: sessionId });
		return chainId;
	}

	/**
	 * 向指定鏈中新增任務並持久化
	 */
	async addTaskToChain(chainId: string, taskData: TaskDTO): Promise<string> {
		const chain = this.chains.get(chainId);
		if (!chain) throw new Error(`Chain ${chainId} not found.`);

		const taskId = taskData.id || `task-${uuidv4().substring(0, 8)}`;
		const task = new Task({
			...taskData,
			id: taskId,
			sessionId: chain.sessionId,
			chainId: chainId,
			status: TaskStatus.PENDING
		});

		await this.runtime.taskRepo.save(task.toDTO());
		chain.tasks.push(task.toDTO());
		this.activeTasks.set(taskId, task);

		recorder.info(`[TaskManager] Task ${taskId} added to chain ${chainId}.`, { type: LogType.LIFECYCLE });
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
		await this.runtime.taskRepo.save(task.toDTO());

		const idx = chain.tasks.findIndex(t => t.id === taskId);
		if (idx !== -1) chain.tasks[idx].assignedAgentId = agentId;

		recorder.info(`[TaskManager] Task ${taskId} assigned to ${agentId}`, { type: LogType.LIFECYCLE });
		this.driveExecution(chainId).catch(() => { });
	}

	/**
	 * 獲取特定任務的詳細資訊
	 */
	getTaskInfo(taskId: string): Task | null {
		return this.activeTasks.get(taskId) || null;
	}

	// --- 核心規劃與執行邏輯 ---

	/**
	 * 處理收件匣中的規劃請求
	 */
	private async processInbox() {
		if (this.inbox.length === 0) return;
		const request = this.inbox.shift()!;

		this.chains.set(request.chainId, {
			status: ChainStatus.PLANNING,
			tasks: [],
			sessionId: request.sessionId,
			traceId: request.traceId,
			goal: request.goal,
			requesterId: request.requesterId
		});

		this.updateChainStatus(request.chainId, ChainStatus.PLANNING);

		try {
			// 1. 初始化推理引擎
			const runtime = GlobalRuntime.getInstance();
			const smartModel = runtime.modelRegistry.getModel(ModelPreset.SMART);
			const agents = runtime.agentManager.getAllAgents()
				.filter(a => a.role !== 'MAIN_AGENT')
				.map(a => ({ id: a.id, role: a.role, capabilities: a.capabilities }));

			const planner = smartModel.withSystemPrompt(
				PromptLoader.load('prompts/planning/plan_todolist.md', 'Plan tasks for: {goal}')
			);

			// 2. 執行單次全局規劃
			recorder.info(`[TaskManager] Generating TodoList for: ${request.goal}`, { type: LogType.PLAN });
			const result = await planner.infer({
				goal: request.goal,
				description: request.description
			} as any, TodoListResponseSchema, {
				variables: {
					available_agents: JSON.stringify(agents)
				}
			});

			const chain = this.chains.get(request.chainId)!;
			chain.planningDocument = result.planning_document;

			// 3. 儲存規劃文件到檔案系統
			const planPath = path.join(process.cwd(), 'workspace', 'tasks', request.chainId, 'plan.md');
			await fs.mkdir(path.dirname(planPath), { recursive: true });
			await fs.writeFile(planPath, result.planning_document, 'utf-8');

			// 4. 建立任務實體
			for (const node of result.tasks) {
				const taskDto: TaskDTO = {
					...node,
					sessionId: request.sessionId,
					chainId: request.chainId,
					status: TaskStatus.PENDING,
					history: [],
					metadata: {}
				};
				const task = new Task(taskDto);
				await runtime.taskRepo.save(task.toDTO());

				chain.tasks.push(task.toDTO());
				this.activeTasks.set(node.id, task);
			}

			this.updateChainStatus(request.chainId, ChainStatus.RUNNING);

			// 5. 發布事件並啟動執行
			runtime.eventBus.publish<IChainCreatedPayload>({
				type: SystemEventType.CHAIN_CREATED,
				userId: 'system',
				sessionId: request.sessionId,
				payload: { goal: request.goal, nodes: chain.tasks },
				timestamp: Date.now()
			});

			await this.driveExecution(request.chainId);

		} catch (error: any) {
			recorder.error(`[TaskManager] Planning failed: ${error.message}`);
			this.updateChainStatus(request.chainId, ChainStatus.FAILED);
		}
	}

	/**
	 * 驅動任務執行循環
	 */
	private async driveExecution(chainId: string) {
		const chain = this.chains.get(chainId);
		if (!chain || chain.status !== ChainStatus.RUNNING) return;

		// 尋找所有處於 PENDING 且依賴已完成的任務
		const readyTaskIds = chain.tasks
			.filter(t => t.status === TaskStatus.PENDING)
			.filter(t => {
				// 檢查所有依賴是否已在同一 Chain 中 COMPLETED
				return (t.dependencies || []).every(depId => {
					const depTask = chain.tasks.find(ct => ct.id === depId);
					return depTask?.status === TaskStatus.COMPLETED;
				});
			})
			.map(t => t.id);

		if (readyTaskIds.length === 0) {
			// 檢查是否所有任務都已完成
			const allCompleted = chain.tasks.every(t => t.status === TaskStatus.COMPLETED);
			if (allCompleted && chain.tasks.length > 0) {
				this.updateChainStatus(chainId, ChainStatus.COMPLETED);
			}
			return;
		}

		// 並行執行所有已就緒的任務
		await Promise.all(readyTaskIds.map(tid => this.executeNode(chainId, tid)));

		// 遞迴驅動下一波
		await this.driveExecution(chainId);
	}

	/**
	 * 執行單個任務節點
	 */
	private async executeNode(chainId: string, taskId: string) {
		const chain = this.chains.get(chainId)!;
		const task = this.activeTasks.get(taskId);
		if (!task) return;

		await this.updateTaskStatus(taskId, TaskStatus.RUNNING);
		recorder.info(`[TaskManager] Executing: ${taskId} (${task.goal})`, { session_id: chain.sessionId });

		const runtime = GlobalRuntime.getInstance();
		try {
			runtime.pulseEngine.watchTask(taskId, task.options?.timeout);

			const agent = this.runtime.agentManager.getAgent(task.assignedAgentId || 'coder-01');
			if (!agent) throw new Error(`Agent ${task.assignedAgentId} not found.`);

			// 收集依賴結果
			const dependencyResults: Record<string, string> = {};
			for (const depId of task.dependencies) {
				const depTask = chain.tasks.find(t => t.id === depId);
				if (depTask?.result) dependencyResults[depId] = depTask.result;
			}

			const executeResult = await agent.execute(task.goal, {
				sessionId: chain.sessionId,
				traceId: chain.traceId,
				agentId: agent.id,
				taskId: taskId,
				chainId: chainId,
				retryCount: task.retryCount,
				lastError: task.metadata?.error,
				dependencyResults
			});

			task.setResult(executeResult);
			if (executeResult.status === 'failed') throw new Error(executeResult.error);

			await this.runtime.taskRepo.save(task.toDTO());
			await this.updateTaskStatus(taskId, TaskStatus.COMPLETED);

			runtime.eventBus.publish<ITaskCompletedPayload>({
				type: SystemEventType.TASK_COMPLETED,
				userId: 'system',
				sessionId: chain.sessionId,
				payload: {
					taskId,
					sessionId: chain.sessionId,
					agentId: agent.id,
					summary: executeResult.summary,
					result: executeResult.result
				},
				timestamp: Date.now()
			});

		} catch (err: any) {
			await this.handleTaskFailure(taskId, err.message);
		} finally {
			runtime.pulseEngine.unwatchTask(taskId);
		}
	}

	// --- 輔助方法與事件監聽 ---

	private setupHeartbeatListener() {
		const runtime = GlobalRuntime.getInstance();
		runtime.eventBus.subscribe<ITaskHeartbeatPayload>(SystemEventType.TASK_HEARTBEAT, (event) => {
			if (event.payload.taskId) runtime.pulseEngine.updateHeartbeat(event.payload.taskId);
		});
	}

	private setupChainListener() {
		const runtime = GlobalRuntime.getInstance();
		const bus = runtime.eventBus;

		bus.subscribe<ITaskCompletedPayload>(SystemEventType.TASK_COMPLETED, async (event) => {
			const { taskId, agentId, summary, sessionId } = event.payload;
			const session = await runtime.sessionManager.getSession(sessionId);
			if (session) {
				session.addMessage(agentId || 'worker', MessageRole.WORKER, summary || 'Task completed', { taskId });
			}
		});

		bus.subscribe<IChainStatusUpdatedPayload>(SystemEventType.CHAIN_STATUS_UPDATED, async (event) => {
			const { chainId, status, sessionId, requesterId } = event.payload;
			if (status === ChainStatus.COMPLETED && requesterId) {
				const mainAgent = runtime.agentManager.getAgent(requesterId) as MainAgent;
				if (mainAgent) await mainAgent.handleChainCompletion(sessionId, chainId);
			}
		});
	}

	private setupTaskFailureListener() {
		const runtime = GlobalRuntime.getInstance();
		runtime.eventBus.subscribe<ITaskFailedPayload>(SystemEventType.TASK_FAILED, (event) => {
			if (event.payload.error?.includes('timeout')) {
				this.handleTaskFailure(event.payload.taskId, event.payload.error);
			}
		});
	}

	private async handleTaskFailure(taskId: string, error: string) {
		const task = this.activeTasks.get(taskId);
		if (!task) return;

		const maxRetries = task.options?.maxRetries ?? 3;
		const chainId = this.findChainIdByTaskId(taskId);

		if (task.retryCount < maxRetries) {
			task.retryCount++;
			if (task.metadata) delete task.metadata.error;
			await this.updateTaskStatus(taskId, TaskStatus.READY);
			recorder.warn(`[TaskManager] Retrying task ${taskId} (${task.retryCount}/${maxRetries}) due to: ${error}`);
			if (chainId) this.driveExecution(chainId).catch(() => { });
		} else {
			recorder.error(`[TaskManager] Task ${taskId} failed after ${task.retryCount} retries: ${error}`);
			await this.updateTaskStatus(taskId, TaskStatus.FAILED, error);
			if (chainId) this.updateChainStatus(chainId, ChainStatus.FAILED);
		}
	}

	private findChainIdByTaskId(taskId: string): string | null {
		for (const [chainId, state] of this.chains.entries()) {
			if (state.tasks.some(t => t.id === taskId)) return chainId;
		}
		return null;
	}

	public updateChainStatus(chainId: string, status: ChainStatus) {
		const chain = this.chains.get(chainId);
		if (!chain || (chain.status === status)) return;

		const oldStatus = chain.status;
		chain.status = status;
		recorder.info(`[TaskManager] Chain ${chainId} status: ${oldStatus} -> ${status}`, { type: LogType.LIFECYCLE, session_id: chain.sessionId });

		GlobalRuntime.getInstance().eventBus.publish<IChainStatusUpdatedPayload>({
			type: SystemEventType.CHAIN_STATUS_UPDATED,
			userId: 'system',
			sessionId: chain.sessionId,
			payload: { chainId, sessionId: chain.sessionId, status, oldStatus, goal: chain.goal, requesterId: chain.requesterId },
			timestamp: Date.now()
		});
	}

	public async updateTaskStatus(taskId: string, status: TaskStatus, error?: string) {
		const task = this.activeTasks.get(taskId);
		if (!task) return;

		task.updateStatus(status);
		if (error) task.metadata = { ...task.metadata, error };
		await this.runtime.taskRepo.save(task.toDTO());

		const chainId = this.findChainIdByTaskId(taskId);
		if (chainId) {
			const chain = this.chains.get(chainId);
			if (chain) {
				const idx = chain.tasks.findIndex(t => t.id === taskId);
				if (idx !== -1) chain.tasks[idx] = task.toDTO();

				GlobalRuntime.getInstance().eventBus.publish<ITaskStatusUpdatedPayload>({
					type: SystemEventType.TASK_STATUS_UPDATED,
					userId: 'system',
					sessionId: chain.sessionId,
					payload: { taskId, chainId, status, oldStatus: TaskStatus.PENDING, goal: task.goal, error },
					timestamp: Date.now()
				});
			}
		}
	}
}
