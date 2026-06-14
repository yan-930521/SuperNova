import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { IEventBus, SystemEvents, AgentEvents } from '../../core/messaging/IBus';
import { Config } from '../../config/Config';
import { ComplexFlow } from '../../domain/task/flow/ComplexFlow';
import { EmergencyFlow } from '../../domain/task/flow/EmergencyFlow';
import { ExploratoryFlow } from '../../domain/task/flow/ExploratoryFlow';
import { InstantFlow } from '../../domain/task/flow/InstantFlow';
import { RecursiveFlow } from '../../domain/task/flow/RecursiveFlow';
import { SimpleFlow } from '../../domain/task/flow/SimpleFlow';
import { StandardFlow } from '../../domain/task/flow/StandardFlow';
import { Task } from '../../domain/task/Task';
import { recorder } from '../../infra/LogManager';
import { ITaskRepository } from '../../infra/persistence/IRepository';
import { TaskStatus } from '../../infra/types/task';
import { IdGenerator } from '../../utils/IdGenerator';

import { ContextAssembler } from '../context/ContextAssembler';

/**
 * TaskService (任務應用層服務) - SuperNova 0.7.0
 * 職責: 負責任務實體的管理、快取與持久化，以及任務調度。
 * 核心策略：【任務主導】與【記憶體優先】。
 */
export class TaskService implements ILifecycle {
  /** 記憶體快取 (L1)：所有活躍任務的唯一實例 */
  private activeTasks = new Map<string, Task>();

  constructor(
    private readonly taskRepo: ITaskRepository<Task>,
    private readonly systemBus: IEventBus,
    private readonly agentBus: IEventBus,
    private readonly config: Config
  ) {}

  /**
   * 初始化：執行水合 (Hydration) 並訂閱時鐘脈搏
   */
  async initialize(): Promise<void> {
    try {
      const { GlobalRuntime } = await import('../../runtime/GlobalRuntime');
      const sessionService = GlobalRuntime.getInstance().container.resolve<any>('SessionService');
      
      const sessionIds = await sessionService.getAllSessionIds();
      for (const sessionId of sessionIds) {
        const rootTasks = await this.taskRepo.findRootsBySession(sessionId);
        for (const rootTask of rootTasks) {
          if (rootTask.status !== 'archived') {
            this.registerTask(rootTask);
          }
        }
      }

      // 訂閱系統時鐘，驅動任務調度
      this.systemBus.subscribe(SystemEvents.Runtime.Tick, () => {
        this.dispatchReadyTasks();
      });

      recorder.info(`[TaskService] Task system initialized. ${this.activeTasks.size} tasks hydrated.`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[TaskService] Initialization failed: ${error}`, { type: 'SYSTEM' });
    }
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  /**
   * 核心調度邏輯：掃描並啟動就緒任務
   */
  public dispatchReadyTasks(): void {
    const limits = this.config.runtime.concurrency.phase_limits;
    const activeTasks = this.getActiveTasks();

    // 1. 統計各階段正在執行的數量
    const runningCounts: Record<string, number> = {
      PLANNING: 0,
      DOING: 0,
      CHECKING: 0,
      ACTING: 0
    };

    activeTasks.forEach(t => {
      if (t.status === 'running') {
        const phase = t.flow.currentPhase;
        if (runningCounts[phase] !== undefined) {
          runningCounts[phase]++;
        }
      }
    });

    // 2. 對每個有子圖的根任務或活動任務進行掃描
    activeTasks.forEach(task => {
      if (task.isParent && task.subGraph) {
        // 獲取所有就緒任務
        const readyTasks = task.subGraph.getReadyTasks();
        
        for (const subTask of readyTasks) {
          const phase = subTask.flow.currentPhase;
          const limit = (limits as any)[phase] || 1;
          const current = runningCounts[phase] || 0;

          if (current < limit) {
            // 啟動任務
            this.startTaskExecution(subTask);
            runningCounts[phase]++;
          }
        }
      }
    });
  }

  /**
   * 啟動任務執行
   */
  private async startTaskExecution(task: Task): Promise<void> {
    task.updateStatus('running');

    // 獲取依賴項實體
    const dependencies: Task[] = [];
    for (const depId of task.dependencies) {
      const depTask = await this.getTask(depId);
      if (depTask) dependencies.push(depTask);
    }

    // 組裝上下文
    const assembledContext = ContextAssembler.assemble(task, dependencies);
    task.context = assembledContext;
    
    // 發布任務啟動事件
    this.agentBus.publish({
      type: AgentEvents.Phase.Start,
      timestamp: Date.now(),
      payload: {
        sessionId: task.sessionId,
        traceId: task.traceId,
        taskId: task.id,
        phase: task.flow.currentPhase,
        content: assembledContext
      }
    });

    recorder.info(`[TaskService] Dispatched Task: ${task.id} (${task.flow.currentPhase})`, { 
      type: 'SYSTEM',
      trace_id: task.traceId
    });
  }

  // --- 記憶體管理 (L1 Core) ---

  /**
   * 註冊任務入 L1。此後所有操作均基於此物件引用。
   */
  public registerTask(task: Task, visited: Set<string> = new Set()): void {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    
    this.activeTasks.set(task.id, task);
    
    if (task.isParent && task.subGraph) {
      task.subGraph.getAllTasks().forEach(sub => {
        sub.metadata.parentTaskId = task.id;
        this.registerTask(sub, visited);
      });
    }
  }

  /**
   * 結案處理：從 L1 移除
   */
  public unregisterTask(taskId: string): void {
    this.activeTasks.delete(taskId);
  }

  /**
   * 獲取快取中的所有活躍物件
   */
  public getActiveTasks(): Task[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 獲取任務 (快取優先)
   */
  async getTask(taskId: string): Promise<Task | null> {
    // 1. 先查快取
    const cached = this.activeTasks.get(taskId);
    if (cached) return cached;

    // 2. 查Repo
    const stored = await this.taskRepo.load(taskId);
    if (stored) {
      this.registerTask(stored);
      return stored;
    }
    return null;
  }

  // --- 狀態更新 (Write-Through 策略) ---

  /**
   * 更新任務：同步更新 L1，背景更新 L2
   */
  async updateTask(task: Task): Promise<void> {
    // A. 更新 L1 (Map 裡存的是引用，其實這步通常已經在外部修改物件時完成了，這裡確保它被註冊)
    if (!this.activeTasks.has(task.id)) {
      this.registerTask(task);
    }

    // B. 更新 L2 (備份存檔) - 這裡是關鍵，保證數據不丟失
    await this.taskRepo.save(task);
  }

  /**
   * 建立新任務 (初始化入 L1)
   */
  async createTask(params: {
    sessionId: string;
    goal: string;
    description: string;
    templateType: string;
    traceId?: string;
    parentTaskId?: string;
  }): Promise<Task> {
    // 快取優先的重複檢查
    const duplicate = Array.from(this.activeTasks.values()).find(t => 
      t.sessionId === params.sessionId && 
      t.goal === params.goal && 
      t.status !== 'archived'
    );
    if (duplicate) return duplicate;

    const taskId = IdGenerator.task();
    const traceId = params.traceId || IdGenerator.traceFromTask(taskId);
    const task = new Task(taskId, traceId, params.sessionId, params.goal, params.description, 'work', 'pending');

    this.applyTemplate(task, params.templateType);
    if (params.parentTaskId) task.metadata.parentTaskId = params.parentTaskId;

    // 同步雙寫
    await this.updateTask(task);
    return task;
  }

  /**
   * 驅動狀態遷徙 (全記憶體操作)
   */
  async transitionTask(taskId: string, result: string): Promise<string> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found in L1 or L2`);

    const oldPhase = task.flow.currentPhase;
    const newPhase = task.nextPhase(result);

    // 更新持久化備份
    await this.updateTask(task);

    recorder.info(`[TaskService] Transition: ${task.id} (${oldPhase} -> ${newPhase})`, { type: 'SYSTEM' });
    return newPhase;
  }

  // --- 私有辅助 ---

  private applyTemplate(task: Task, type: string): void {
    switch (type) {
      case 'Instant': task.flow = new InstantFlow(); break;
      case 'Simple': task.flow = new SimpleFlow(); break;
      case 'Standard': task.flow = new StandardFlow(); break;
      case 'Complex': task.flow = new ComplexFlow(); break;
      case 'Exploratory': task.flow = new ExploratoryFlow(); break;
      case 'Emergency': task.flow = new EmergencyFlow(); break;
      case 'Recursive': task.flow = new RecursiveFlow(); break;
      default: task.flow = new StandardFlow(); break;
    }
  }

  // --- 透傳 Repo 檢索 ---

  async findBySession(sessionId: string): Promise<Task[]> {
    return await this.taskRepo.findBySession(sessionId);
  }

  async findRootsBySession(sessionId: string): Promise<Task[]> {
    return await this.taskRepo.findRootsBySession(sessionId);
  }

  async findTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return await this.taskRepo.findTasksByStatus(status);
  }
}
