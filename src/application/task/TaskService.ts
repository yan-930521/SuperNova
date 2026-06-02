import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import {
    Commands, Events, ICommand, ICommandBus, IEvent, IEventBus
} from '../../core/messaging/IBus';
import { Task } from '../../domain/task/Task';
import { recorder } from '../../infra/LogManager';
import { ITaskRepository } from '../../infra/persistence/IRepository';
import { ChainStatus, TaskStatus } from '../../infra/types/task';
import { OrchestratedContextService } from '../memory/OrchestratedContextService';

/**
 * 啟動規劃指令類別 (內部使用)
 */
class PlanGoalCommand implements ICommand<Commands.Task.Plan> {
  readonly type = Commands.Task.Plan;
  constructor(public readonly payload: {
    sessionId: string;
    chainId: string;
    goal: string;
    description: string;
  }) { }
}

/**
 * 分派任務指令的 Payload
 */
export interface IDispatchTaskPayload {
  chainId: string;
  sessionId: string;
  goal: string;
  description: string;
  traceId: string;
}

/**
 * 分派任務指令類別
 */
export class DispatchTaskCommand implements ICommand<Commands.Task.Dispatch> {
  readonly type = Commands.Task.Dispatch;
  constructor(public readonly payload: IDispatchTaskPayload) { }
}

/**
 * 任務鏈狀態摘要
 */
export interface IChainStatus {
  chainId: string;
  sessionId: string;
  goal: string;
  status: ChainStatus;
  planningDocument?: string;
}

/**
 * TaskService (任務服務)
 * 負責管理任務鏈生命週期、執行 3x3 自癒決策、並協調任務執行。
 */
export class TaskService implements ILifecycle {
  /** 活躍中的任務緩存 (taskId -> Task Entity) */
  private activeTasks = new Map<string, Task>();
  /** 活躍中的任務鏈元數據 (chainId -> IChainStatus) */
  private activeChains = new Map<string, IChainStatus>();

  constructor(
    private readonly commandBus: ICommandBus,
    private readonly eventBus: IEventBus,
    private readonly taskRepo: ITaskRepository<Task>,
    private readonly contextService: OrchestratedContextService
  ) { }

  /**
   * 生命週期：初始化，註冊指令與事件
   */
  async initialize(): Promise<void> {
    // 註冊分派任務指令處理器
    this.commandBus.registerHandler(Commands.Task.Dispatch, this.handleDispatchTask.bind(this));

    // 註冊重試指令處理器
    this.commandBus.registerHandler(Commands.Task.Retry, this.handleRetryTask.bind(this));

    // 訂閱任務失敗事件，觸發自癒邏輯
    this.eventBus.subscribe(Events.Task.Failed, this.onTaskFailed.bind(this));

    // 訂閱任務圖建立事件，記錄元數據並持久化任務節點
    this.eventBus.subscribe(Events.Task.Created, async (event: IEvent<Events.Task.Created, any>) => {
      const { chainId, sessionId, goal, planningDocument, nodes } = event.payload;

      // 1. 記錄鏈元數據
      this.activeChains.set(chainId, {
        chainId,
        sessionId,
        goal,
        status: ChainStatus.RUNNING,
        planningDocument
      });

      // 2. 將原始節點數據實例化並持久化至 Repository
      if (nodes && Array.isArray(nodes)) {
        recorder.info(`[TaskService] Persisting ${nodes.length} new tasks for chain: ${chainId}`, { type: 'SYSTEM' });
        for (const raw of nodes) {
          const task = new Task(
            raw.id,
            chainId,
            sessionId,
            raw.goal,
            raw.description,
            raw.type,
            TaskStatus.PENDING
          );
          task.dependencies = raw.dependencies || [];
          task.assignedAgentId = raw.assignedAgentId;

          // 保存到磁碟
          await this.taskRepo.save(task);
          // 加入活躍緩存
          this.activeTasks.set(task.id, task);
        }
      }
    });

    recorder.info('[TaskService] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[TaskService] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    // 停機前持久化所有活躍任務
    for (const task of this.activeTasks.values()) {
      await this.taskRepo.save(task);
    }
    recorder.info('[TaskService] Stopped and persisted active tasks', { type: 'SYSTEM' });
  }

  /**
   * 獲取任務鏈狀態 (供工具調用)
   */
  public getChainStatus(chainId: string): IChainStatus | undefined {
    return this.activeChains.get(chainId);
  }

  /**
   * 獲取特定鏈下的所有任務實體
   */
  public async getChainTasks(chainId: string): Promise<Task[]> {
    // 先從緩存找，不夠的話從 Repo 找
    const cachedTasks = Array.from(this.activeTasks.values()).filter(t => t.chainId === chainId);
    if (cachedTasks.length > 0) return cachedTasks;

    // TODO: Repo 應該支援按 chainId 查詢。目前先回傳空或掃描。
    return [];
  }

  /**
   * 獲取單一任務資訊
   */
  public async getTaskInfo(taskId: string): Promise<Task | null> {
    return this.activeTasks.get(taskId) || await this.taskRepo.load(taskId);
  }

  /**
   * 列出所有活躍的任務鏈
   */
  public listChains(): IChainStatus[] {
    return Array.from(this.activeChains.values());
  }

  /**
   * 手動指派任務給特定代理
   */
  public async assignTask(taskId: string, agentId: string): Promise<void> {
    const task = await this.getTaskInfo(taskId);
    if (!task) throw new Error(`[TaskService] Task ${taskId} not found.`);

    task.assignedAgentId = agentId;
    await this.taskRepo.save(task);

    recorder.info(`[TaskService] Task ${taskId} assigned to Agent: ${agentId}`, { type: 'SYSTEM' });
  }

  /**
   * 處理分派任務：啟動規劃流程並初始化任務圖
   */
  private async handleDispatchTask(command: DispatchTaskCommand): Promise<{ chainId: string }> {
    const { chainId, sessionId, goal, traceId, description } = command.payload;

    recorder.info(`[TaskService] Dispatching new goal for chain: ${chainId}`, {
      type: 'SYSTEM',
      session_id: sessionId,
      trace_id: traceId
    });

    // 將初始的 mission briefing 存入 OrchestratedContext
    try {
      await this.contextService.setVariable(chainId, 'mission_briefing', `### Goal\n${goal}\n\n### Description\n${description}`);
      await this.contextService.addFact(chainId, `初始任務背景與環境資訊已記錄於變數 'mission_briefing'。`);
    } catch (e) {
      recorder.warn(`[TaskService] Failed to set initial context: ${e}`, { type: 'SYSTEM' });
    }

    // 1. 呼叫 PlanningCoordinator 進行規劃
    try {
      await this.commandBus.send(new PlanGoalCommand({
        sessionId,
        chainId,
        goal,
        description: description || goal
      }));
    } catch (error) {
      recorder.error(`[TaskService] Planning failed for chain: ${chainId}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return { chainId };
  }

  /**
   * 處理任務重試
   */
  private async handleRetryTask(command: ICommand<Commands.Task.Retry>): Promise<void> {
    // 實作邏輯：重置任務狀態並發送給排程器
    recorder.info(`[TaskService] Retrying task: ${command.type}`, { type: 'SYSTEM' });
  }

  /**
   * 3x3 自癒決策核心：當任務失敗時觸發
   */
  private async onTaskFailed(event: IEvent<Events.Task.Failed, any>): Promise<void> {
    const { taskId, error } = event.payload;
    const task = await this.taskRepo.load(taskId);

    if (!task) return;

    recorder.warn(`[TaskService] Handling failure for task: ${taskId}. Error: ${error}`, { type: 'SYSTEM' });

    // Level 1: 節點重試 (Node Retry)
    if (task.retryCount < 3) {
      task.retryCount++;
      task.updateStatus(TaskStatus.READY); // 設為 Ready 讓排程器重新拾取
      await this.taskRepo.save(task);

      recorder.info(`[TaskService] Escalating to Level 1: Retrying node ${taskId} (${task.retryCount}/3)`, { type: 'SYSTEM' });

      // 通知排程器 (透過事件廣播)
      this.eventBus.publish({
        type: Events.Task.Created, // 重新激發執行流
        timestamp: Date.now(),
        payload: { taskId, chainId: task.chainId }
      });
    }
    // Level 2: 認知重規劃 (Cognitive Re-plan)
    else {
      recorder.error(`[TaskService] Escalating to Level 2: Max retries reached for node ${taskId}. Triggering re-plan.`, { type: 'SYSTEM' });

      // TODO: 發送指令給 PlanningCoordinator 進行局部重規劃
      // await this.commandBus.send(new ReplanCommand(task.chainId, error));
    }
  }

  /**
   * 取得活躍任務 (供外部查詢)
   */
  public getTask(id: string): Task | undefined {
    return this.activeTasks.get(id);
  }
}
