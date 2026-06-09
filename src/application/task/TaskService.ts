import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { ITaskRepository } from '../../infra/persistence/IRepository';
import { Task } from '../../domain/task/Task';
import { TaskStatus } from '../../infra/types/task';
import { recorder } from '../../infra/LogManager';
import { IdGenerator } from '../../utils/IdGenerator';

// 導入具體領域 Flow 類別
import { StandardFlow } from '../../domain/task/flow/StandardFlow';
import { SimpleFlow } from '../../domain/task/flow/SimpleFlow';
import { EmergencyFlow } from '../../domain/task/flow/EmergencyFlow';
import { InstantFlow } from '../../domain/task/flow/InstantFlow';
import { ComplexFlow } from '../../domain/task/flow/ComplexFlow';
import { ExploratoryFlow } from '../../domain/task/flow/ExploratoryFlow';
import { RecursiveFlow } from '../../domain/task/flow/RecursiveFlow';

/**
 * TaskService (任務應用層服務) - SuperNova 0.4.0
 * 職責: 負責任務實體的建立、讀取、持久化與分形子圖邏輯。
 */
export class TaskService implements ILifecycle {
  constructor(
    private readonly taskRepo: ITaskRepository<Task>
  ) {}

  async initialize(): Promise<void> {
    recorder.info('[TaskService] Initialized.', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  /**
   * 建立一個新任務並初始化其狀態機
   * 根據 templateType 直接 new 出對應的領域類別
   */
  async createTask(params: {
    sessionId: string;
    goal: string;
    description: string;
    templateType: string;
    traceId: string;
    parentTaskId?: string;
  }): Promise<Task> {
    const taskId = IdGenerator.task();
    const traceId = params.traceId;

    const task = new Task(
      taskId,
      traceId,
      params.sessionId,
      params.goal,
      params.description,
      'work',
      'pending'
    );

    // 直接根據類型實例化具體的 Flow 對象 (移除舊有的硬編碼映射表)
    switch (params.templateType) {
      case 'Instant': task.flow = new InstantFlow(); break;
      case 'Simple': task.flow = new SimpleFlow(); break;
      case 'Standard': task.flow = new StandardFlow(); break;
      case 'Complex': task.flow = new ComplexFlow(); break;
      case 'Exploratory': task.flow = new ExploratoryFlow(); break;
      case 'Emergency': task.flow = new EmergencyFlow(); break;
      case 'Recursive': task.flow = new RecursiveFlow(); break;
      default: 
        recorder.warn(`[TaskService] Unknown templateType: ${params.templateType}, fallback to Standard`, { type: 'SYSTEM' });
        task.flow = new StandardFlow(); 
        break;
    }

    if (params.parentTaskId) {
      task.metadata.parentTaskId = params.parentTaskId;
    }

    await this.taskRepo.save(task);

    recorder.info(`[TaskService] Created task ${taskId} with [${task.flow.templateType}Flow]`, {
      type: 'SYSTEM',
      session_id: params.sessionId,
      trace_id: params.traceId
    });

    return task;
  }

  /**
   * 獲取單一任務
   */
  async getTask(taskId: string): Promise<Task | null> {
    return await this.taskRepo.load(taskId);
  }

  /**
   * 更新任務狀態並持久化
   */
  async updateTask(task: Task): Promise<void> {
    await this.taskRepo.save(task);
  }

  /**
   * 按會話獲取所有任務
   */
  async findBySession(sessionId: string): Promise<Task[]> {
    return await this.taskRepo.findBySession(sessionId);
  }

  /**
   * 驅動任務前進到下一個 Phase
   * @param taskId 任務 ID
   * @param result 當前 Phase 的結果 ('success', 'fail', 'escalate')
   */
  async transitionTask(taskId: string, result: string): Promise<string> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const oldPhase = task.flow.currentPhase;
    const newPhase = task.nextPhase(result);

    await this.updateTask(task);

    recorder.info(`[TaskService] Task ${taskId} transitioned: ${oldPhase} -> ${newPhase} (Result: ${result})`, {
      type: 'SYSTEM',
      session_id: task.sessionId
    });

    return newPhase;
  }
}
