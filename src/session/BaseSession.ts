import { ISession } from '../../interfaces/session/ISession';
import { IMiddleware } from '../../interfaces/session/IMiddleware';
import { MiddlewareChain } from './MiddlewareChain';
import { TaskGraph } from './TaskGraph';
import { ParallelScheduler } from './ParallelScheduler';
import { ReadyQueue } from './ReadyQueue';
import { IReadyQueue } from '../../interfaces/session/IReadyQueue';

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

  constructor(
    public id: string,
    public goal: string
  ) {}

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
  async tick(): Promise<void> {
    console.log(`Session ${this.id} ticking...`);

    // 1. 調用調度器，根據 TaskGraph 狀態填充 ReadyQueue
    this.scheduler.schedule(this.taskGraph, this.readyQueue);

    // 2. 從 ReadyQueue 中取出所有當前就緒的任務
    const tasksToExecute: string[] = [];
    let taskId: string | null;
    while ((taskId = this.readyQueue.pop()) !== null) {
      tasksToExecute.push(taskId);
    }

    // 3. 模擬並行執行（目前僅打印 Log 並標記完成）
    // 注意：在實際場景中，這些任務可能會異步並行執行
    for (const id of tasksToExecute) {
      console.log(`[BaseSession] Executing task: ${id}`);
      // 任務完成後通知調度器，這會進一步更新 TaskGraph 並可能解鎖更多任務
      this.scheduler.onTaskCompleted(id, this.taskGraph, this.readyQueue);
    }
  }

  async exportLog(): Promise<string> {
    return "";
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      goal: this.goal,
      status: this.status
    };
  }

  async loadFromJSON(data: Record<string, any>): Promise<void> {
    this.id = data.id;
    this.goal = data.goal;
    this.status = data.status;
  }

  async snapshot(): Promise<string> {
    return "snapshot-id";
  }

  async rollback(checkpointId: string): Promise<void> {
    console.log(`Rolling back to ${checkpointId}`);
  }
}
