import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { AgentEvent, AgentEvents, IEventBus, SystemEvents } from '../../core/messaging/IBus';
import { recorder } from '../../infra/LogManager';
import { TaskService } from './TaskService';
import { Task } from '../../domain/task/Task';
import { IdGenerator } from '../../utils/IdGenerator';

/**
 * TaskScheduler (任務排程器) - SuperNova 0.4.0
 * 職責: 監聽事件並驅動任務狀態機，自動分派子任務。
 */
export class TaskScheduler implements ILifecycle {
  constructor(
    private readonly bus: IEventBus,
    private readonly taskService: TaskService
  ) {}

  async initialize(): Promise<void> {
    this.setupSubscriptions();
    recorder.info('[TaskScheduler] Initialized and listening to Flow events.', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  private setupSubscriptions(): void {
    // 1. 初始化任務
    this.bus.subscribe(AgentEvents.Flow.Initialize, this.onFlowInitialize.bind(this));

    // 2. 階段完成回調
    this.bus.subscribe(AgentEvents.Planning.Finish, (e) => this.handlePhaseFinish(e, 'success'));
    this.bus.subscribe(AgentEvents.Doing.Finish, (e) => this.handlePhaseFinish(e, 'success'));
    this.bus.subscribe(AgentEvents.Checking.Pass, (e) => this.handlePhaseFinish(e, 'success'));
    this.bus.subscribe(AgentEvents.Checking.Fail, (e) => this.handlePhaseFinish(e, 'fail'));
    this.bus.subscribe(AgentEvents.Acting.Finish, (e) => this.handlePhaseFinish(e, 'success'));

    // 3. 異常上報
    this.bus.subscribe(AgentEvents.Flow.Escalate, (e) => this.handlePhaseFinish(e, 'escalate'));

    // 4. 定期檢查子任務依賴 (Tick)
    this.bus.subscribe(SystemEvents.Runtime.Tick, this.onTick.bind(this));
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
        this.triggerPhaseStart(updatedTask);
      }
    } catch (error) {
      recorder.error(`[TaskScheduler] Failed to initialize flow: ${error}`, { type: 'SYSTEM' });
    }
  }

  /**
   * 處理各個 Agent 階段完成後的回調，驅動狀態機前進
   */
  private async handlePhaseFinish(event: AgentEvent, result: string): Promise<void> {
    const { taskId } = event.payload;
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
        this.triggerPhaseStart(task);
      }
    } catch (error) {
      recorder.error(`[TaskScheduler] Phase transition failed for task ${taskId}: ${error}`, { type: 'SYSTEM' });
    }
  }

  /**
   * 根據目前 Phase 發送啟動事件，召喚對應角色的 Agent
   */
  private triggerPhaseStart(task: Task): void {
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
      case 'DOING': eventType = AgentEvents.Doing.Start; break;
      case 'CHECKING': eventType = AgentEvents.Checking.Start; break;
      case 'ACTING': eventType = AgentEvents.Acting.Start; break;
      default:
        recorder.warn(`[TaskScheduler] Unhandled phase start: ${phase}`, { type: 'SYSTEM' });
        break;
    }

    if (eventType) {
      this.bus.publish({
        type: eventType,
        timestamp: Date.now(),
        payload: {
          sessionId: task.sessionId,
          traceId: task.traceId,
          taskId: task.id,
          goal: task.goal,
          content: task.description,
          spanId: IdGenerator.span('sys')
        }
      });
    }
  }

  /**
   * 定期檢查任務圖依賴，啟動子任務
   */
  private async onTick(): Promise<void> {
    // TODO: 這裡應該掃描所有 RUNNING 狀態的母任務
    // 檢查其 subGraph 中哪些子任務已 Ready
    // 發布初始化或啟動事件
  }
}
