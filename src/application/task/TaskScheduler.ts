import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { AgentEvent, AgentEvents, IEventBus, SystemEvents } from '../../core/messaging/IBus';
import { recorder } from '../../infra/LogManager';
import { TaskService } from './TaskService';
import { Task } from '../../domain/task/Task';
import { IdGenerator } from '../../utils/IdGenerator';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';

/**
 * TaskScheduler (任務排程器) - SuperNova 0.4.0
 * 職責: 監聽事件並驅動任務狀態機，自動分派子任務。
 */
export class TaskScheduler implements ILifecycle {
  constructor(
    private readonly systemBus: IEventBus,
    private readonly agentBus: IEventBus,
    private readonly taskService: TaskService
  ) {}

  async initialize(): Promise<void> {
    this.setupSubscriptions();
    recorder.info('[TaskScheduler] Initialized and listening to Flow events.', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  private setupSubscriptions(): void {
    // 1. 初始化任務 (AgentBus)
    this.agentBus.subscribe(AgentEvents.Flow.Initialize, this.onFlowInitialize.bind(this));

    // 2. 階段完成回調 (AgentBus)
    this.agentBus.subscribe(AgentEvents.Planning.Finish, (e) => this.handlePhaseFinish(e, 'success'));
    this.agentBus.subscribe(AgentEvents.Doing.Finish, (e) => this.handlePhaseFinish(e, 'success'));
    this.agentBus.subscribe(AgentEvents.Checking.Pass, (e) => this.handlePhaseFinish(e, 'success'));
    this.agentBus.subscribe(AgentEvents.Checking.Fail, (e) => this.handlePhaseFinish(e, 'fail'));
    this.agentBus.subscribe(AgentEvents.Acting.Finish, (e) => this.handlePhaseFinish(e, 'success'));

    // 3. 異常上報 (AgentBus)
    this.agentBus.subscribe(AgentEvents.Flow.Escalate, (e) => this.handlePhaseFinish(e, 'escalate'));

    // 4. 定期檢查子任務依賴 (SystemBus)
    this.systemBus.subscribe(SystemEvents.Runtime.Tick, this.onTick.bind(this));
  }

  /**
   * 建立任務實體並啟動第一階段
   */
  private async onFlowInitialize(event: AgentEvent): Promise<void> {
    const { sessionId, goal, content, templateType, traceId } = event.payload;

    try {
      // 1. 建立任務 (初始狀態為 READY)
      const task = await this.taskService.createTask({
        sessionId,
        goal: goal!,
        description: content!,
        templateType: templateType!,
        traceId,
        parentTaskId: event.payload.taskId 
      });

      // 2. 明確執行初始遷徙：從 READY 進入第一個正式執行階段 (如 PLANNING 或 DOING)
      // 理由：確保狀態機的起始動作是受控且顯式的。
      await this.taskService.transitionTask(task.id, 'success');
      
      // 3. 重新加載任務實體以獲取最新 Phase
      const updatedTask = await this.taskService.getTask(task.id);
      if (updatedTask) {
        this.triggerPhaseStart(updatedTask, event.payload.spanId);
      }
    } catch (error) {
      recorder.error(`[TaskScheduler] Failed to initialize flow: ${error}`, { type: 'SYSTEM' });
    }
  }

  /**
   * 處理各個 Agent 階段完成後的回調，驅動狀態機前進
   */
  private async handlePhaseFinish(event: AgentEvent, result: string): Promise<void> {
    const { taskId, content, spanId: eventSpanId } = event.payload;
    if (!taskId) return;

    try {
      // 1. 若為規劃完成，需將子圖 (subGraph) 數據同步至母任務實體
      if (event.type === AgentEvents.Planning.Finish && event.payload.metadata?.subGraph) {
        const task = await this.taskService.getTask(taskId);
        if (task) {
          task.setSubGraph(event.payload.metadata.subGraph);
          await this.taskService.updateTask(task);
        }
      }

      // 2. 調用服務驅動狀態機遷徙
      const nextPhase = await this.taskService.transitionTask(taskId, result);
      
      // 3. 根據新 Phase 啟動對應的 Agent 協作
      const task = await this.taskService.getTask(taskId);
      if (task) {
        this.triggerPhaseStart(task, eventSpanId);

        // 如果任務到達 FINISH 且它是某個母任務的子任務，我們需要回報給母任務
        if (nextPhase === 'FINISH' && task.metadata?.parentTaskId) {
          task.updateStatus('completed');
          await this.taskService.updateTask(task);

          const parentTask = await this.taskService.getTask(task.metadata.parentTaskId as string);
          if (parentTask && parentTask.subGraph) {
            parentTask.subGraph.handleTaskCompletion(taskId);
            
            // 更新母任務中子圖節點的狀態
            const childNodeInParent = parentTask.subGraph.getAllTasks().find(t => t.id === taskId);
            if (childNodeInParent) {
              childNodeInParent.updateStatus('completed');
              childNodeInParent.metadata.result = content;
            }
            await this.taskService.updateTask(parentTask);

            // 檢查是否所有子任務都已完成
            const allCompleted = parentTask.subGraph.getAllTasks().every(t => t.status === 'completed');
            if (allCompleted) {
              recorder.info(`[TaskScheduler] All subtasks for parent ${parentTask.id} completed.`, { type: 'SYSTEM' });
              
              // 母任務的 DOING 階段完成，觸發 DOING.Finish
              this.agentBus.publish({
                type: AgentEvents.Doing.Finish,
                timestamp: Date.now(),
                payload: {
                  sessionId: parentTask.sessionId,
                  traceId: parentTask.traceId,
                  taskId: parentTask.id,
                  content: 'All subtasks completed successfully.',
                  spanId: IdGenerator.span('sys'),
                  parentSpanId: eventSpanId // 此處由最後一個子任務完成觸發
                }
              });
            }
          }
        }
      }
    } catch (error) {
      recorder.error(`[TaskScheduler] Phase transition failed for task ${taskId}: ${error}`, { type: 'SYSTEM' });
    }
  }

  /**
   * 根據目前 Phase 發送啟動事件，召喚對應角色的 Agent
   * @param task 任務實體
   * @param parentSpanId 觸發此階段的父 Span ID
   */
  private triggerPhaseStart(task: Task, parentSpanId?: string): void {
    const phase = task.flow.currentPhase;
    
    // 若達到結束狀態，停止流轉並記錄日誌
    if (phase === 'FINISH') {
      recorder.info(`[TaskScheduler] Task ${task.id} has reached FINISH state.`, { 
        type: 'SYSTEM', 
        session_id: task.sessionId 
      });
      return;
    }

    let eventType: string | null = null;
    switch (phase) {
      case 'PLANNING': eventType = AgentEvents.Planning.Start; break;
      case 'DOING': 
        // 只有在任務沒有 subGraph 的情況下才派發 Doing.Start
        // 若有 subGraph，則進入 onTick 等待子任務分發
        if (!task.subGraph || task.subGraph.getAllTasks().length === 0) {
          eventType = AgentEvents.Doing.Start; 
        } else {
          recorder.info(`[TaskScheduler] Task ${task.id} has subGraph, waiting for tick to dispatch children.`, { type: 'SYSTEM' });
        }
        break;
      case 'CHECKING': eventType = AgentEvents.Checking.Start; break;
      case 'ACTING': eventType = AgentEvents.Acting.Start; break;
      default:
        recorder.warn(`[TaskScheduler] Unhandled phase start: ${phase}`, { type: 'SYSTEM' });
        break;
    }

    if (eventType) {
      this.agentBus.publish({
        type: eventType,
        timestamp: Date.now(),
        payload: {
          sessionId: task.sessionId,
          traceId: task.traceId,
          taskId: task.id,
          goal: task.goal,
          content: task.description,
          spanId: IdGenerator.span('sys'),
          parentSpanId: parentSpanId
        }
      });
    }
  }

  /**
   * 定期檢查任務圖依賴，啟動子任務
   */
  private async onTick(): Promise<void> {
    try {
      const config = GlobalRuntime.getInstance().config;
      if (!config) return;

      const { global_max_running_tasks, task_max_fan_out } = config.runtime.concurrency;

      // 1. 獲取可能正在執行子任務的母任務
      // 這裡簡化為撈取所有狀態不為 completed 或 failed 的任務
      const pendingTasks = await this.taskService.findTasksByStatus('pending');
      const runningTasks = await this.taskService.findTasksByStatus('running');
      const activeTasks = [...pendingTasks, ...runningTasks];

      // 2. 計算全局正在執行的子任務數量
      let globalRunningChildCount = 0;
      for (const task of activeTasks) {
        if (task.subGraph && task.flow.currentPhase === 'DOING') {
          globalRunningChildCount += task.subGraph.getAllTasks().filter(t => t.status === 'running').length;
        }
      }

      if (globalRunningChildCount >= global_max_running_tasks) return;

      // 3. 遍歷活躍的母任務，分發子任務
      for (const parentTask of activeTasks) {
        if (!parentTask.subGraph || parentTask.flow.currentPhase !== 'DOING') continue;

        const subTasks = parentTask.subGraph.getAllTasks();
        const runningInParent = subTasks.filter(t => t.status === 'running').length;
        const availableSlots = Math.max(0, task_max_fan_out - runningInParent);

        if (availableSlots <= 0) continue;

        const readyTasks = parentTask.subGraph.getReadyTasks();
        if (readyTasks.length === 0) continue;

        let dispatched = 0;
        let parentModified = false;

        for (const child of readyTasks) {
          if (dispatched >= availableSlots || globalRunningChildCount >= global_max_running_tasks) break;

          // 標記子任務為 running
          child.updateStatus('running');
          
          // 在 Repo 中儲存這個子任務 (讓它成為真正的全局任務，以便後續 CA/DA 可以透過 ID 查詢)
          await this.taskService.updateTask(child);

          // 驅動子任務進入 DOING (從 READY -> DOING)
          await this.taskService.transitionTask(child.id, 'success');

          // 發布事件
          const updatedChild = await this.taskService.getTask(child.id);
          if (updatedChild) {
            this.triggerPhaseStart(updatedChild);
          }

          parentModified = true;
          dispatched++;
          globalRunningChildCount++;
        }

        if (parentModified) {
          await this.taskService.updateTask(parentTask);
        }
      }
    } catch (error) {
      recorder.error(`[TaskScheduler] onTick failed: ${error}`, { type: 'SYSTEM' });
    }
  }
}
