import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { ICommandBus, IEventBus, Commands, Events, ICommand, IEvent } from '../../core/messaging/IBus';
import { TaskGraph } from '../../domain/task/TaskGraph';
import { recorder } from '../../infra/LogManager';
import { TaskStatus } from '../../infra/types/task';

import { Task } from '../../domain/task/Task';

/**
 * 執行任務指令的 Payload
 */
export interface IExecuteTaskPayload {
  taskId: string;
  chainId: string;
  sessionId: string;
}

/**
 * 執行任務指令類別
 */
export class ExecuteTaskCommand implements ICommand<Commands.Task.Execute> {
  readonly type = Commands.Task.Execute;
  constructor(public readonly payload: IExecuteTaskPayload) {}
}

/**
 * TaskScheduler (任務排程器)
 * 作為系統的「節拍器」，負責根據任務圖的依賴關係與狀態，主動分派可執行的任務。
 * 核心邏輯：監聽 Tick 與 任務完成事件，尋找 READY 節點並發送 Execute 指令。
 */
export class TaskScheduler implements ILifecycle {
  /** 正在追蹤的任務圖映射 (chainId -> TaskGraph) */
  private activeGraphs = new Map<string, TaskGraph>();

  constructor(
    private readonly commandBus: ICommandBus,
    private readonly eventBus: IEventBus
  ) {}

  /**
   * 生命週期：初始化，註冊事件訂閱
   */
  async initialize(): Promise<void> {
    // 監聽系統脈搏，定時掃描任務圖
    this.eventBus.subscribe(Events.System.Tick, this.onTick.bind(this));
    
    // 監聽任務完成，及時更新圖狀態
    this.eventBus.subscribe(Events.Task.Finished, this.onTaskFinished.bind(this));
    
    // 監聽新任務圖建立 (由 TaskService 廣播)
    this.eventBus.subscribe(Events.Task.Created, this.onTaskCreated.bind(this));

    recorder.info('[TaskScheduler] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[TaskScheduler] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    this.activeGraphs.clear();
    recorder.info('[TaskScheduler] Stopped', { type: 'SYSTEM' });
  }

  /**
   * 每秒掃描一次所有活躍的圖，找出就緒節點
   */
  private onTick(): void {
    if (this.activeGraphs.size === 0) return;

    for (const [chainId, graph] of this.activeGraphs.entries()) {
      const readyTaskIds = graph.getReadyTasks();
      
      for (const taskId of readyTaskIds) {
        const task = graph.getTask(taskId);
        
        // 只有處於 PENDING 且依賴已滿足的節點才能被分派
        if (task && task.status === TaskStatus.PENDING) {
          this.dispatchTask(task.id, chainId, task.sessionId);
          // 將狀態改為 READY 防止重複分派
          task.updateStatus(TaskStatus.READY);
        }
      }
    }
  }

  /**
   * 執行具體的分派動作
   */
  private async dispatchTask(taskId: string, chainId: string, sessionId: string): Promise<void> {
    recorder.info(`[TaskScheduler] Dispatching Task: ${taskId} for Chain: ${chainId}`, { type: 'SYSTEM' });

    try {
      // 透過 CommandBus 請求執行
      await this.commandBus.send(new ExecuteTaskCommand({ taskId, chainId, sessionId }));
    } catch (error) {
      recorder.error(`[TaskScheduler] Failed to dispatch task: ${taskId}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  /**
   * 當一個任務鏈被建立時，將其加入排程器追蹤
   */
  private onTaskCreated(event: IEvent<Events.Task.Created, any>): void {
    const { chainId, sessionId, nodes } = event.payload;
    if (!nodes || !Array.isArray(nodes)) return;

    recorder.info(`[TaskScheduler] New task chain registered: ${chainId}`, { type: 'SYSTEM' });
    
    // 實例化所有任務節點，確保具備 status 屬性
    const taskEntities = nodes.map(raw => {
      const task = new Task(
        raw.id,
        chainId,
        sessionId,
        raw.goal,
        raw.description,
        raw.type,
        TaskStatus.PENDING // 強制初始化為 PENDING
      );
      task.dependencies = raw.dependencies || [];
      task.assignedAgentId = raw.assignedAgentId;
      return task;
    });

    const graph = new TaskGraph();
    graph.loadData({ 
      nodes: taskEntities, 
      milestones: [], 
      currentMilestoneIndex: 0 
    });
    this.activeGraphs.set(chainId, graph);
  }

  /**
   * 當一個任務完成時，更新圖結構並解鎖後續任務
   */
  private onTaskFinished(event: IEvent<Events.Task.Finished, any>): void {
    const { chainId, taskId } = event.payload;
    const graph = this.activeGraphs.get(chainId);

    if (graph) {
      recorder.debug(`[TaskScheduler] Node completed: ${taskId} in chain: ${chainId}`, { type: 'SYSTEM' });
      graph.completeTask(taskId);

      // 檢查是否所有任務都已完成
      if (graph.getReadyTasks().length === 0 && graph.getAllTasks().every(t => t.status === TaskStatus.COMPLETED)) {
        recorder.info(`[TaskScheduler] All tasks in chain ${chainId} are completed.`, { type: 'SYSTEM' });
        this.activeGraphs.delete(chainId);
      }
    }
  }
}
