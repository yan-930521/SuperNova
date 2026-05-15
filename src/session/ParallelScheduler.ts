import type { IReadyQueue } from '../../interfaces/session/IReadyQueue';
import { logger } from '../infra/LogManager';
import { TaskGraph } from './TaskGraph';

/**
 * ParallelScheduler 負責將 TaskGraph 中已就緒的任務（入度為 0）推送至 ReadyQueue。
 * 它確保任務按依賴關係並行調度。
 */
export class ParallelScheduler {
  private queuedTaskIds = new Set<string>();
  private runningTaskIds = new Set<string>();

  /**
   * 掃描圖中所有入度為 0 且尚未排入隊列的任務並將其排入隊列。
   * @param graph 任務依賴圖
   * @param queue 就緒任務隊列
   */
  schedule(graph: TaskGraph, queue: IReadyQueue): void {
    const readyTasks = graph.getReadyTasks();
    for (const taskId of readyTasks) {
      if (!this.queuedTaskIds.has(taskId) && !this.runningTaskIds.has(taskId)) {
        logger.info(`Scheduling task: ${taskId}`, { type: 'LIFECYCLE' });
        queue.push(taskId);
        this.queuedTaskIds.add(taskId);
      }
    }
  }

  /**
   * 當任務開始執行時調用。
   * @param taskId 任務 ID
   */
  onTaskStarted(taskId: string): void {
    this.runningTaskIds.add(taskId);
    this.queuedTaskIds.delete(taskId);
  }

  /**
   * 當任務完成時調用，更新圖狀態並調度新解鎖的任務。
   * @param taskId 已完成的任務 ID
   * @param graph 任務依賴圖
   * @param queue 就緒任務隊列
   */
  onTaskCompleted(taskId: string, graph: TaskGraph, queue: IReadyQueue): void {
    logger.info(`Task completed: ${taskId}`, { type: 'LIFECYCLE' });
    graph.completeTask(taskId);
    this.runningTaskIds.delete(taskId);
    this.schedule(graph, queue);
  }

  /**
   * 當任務執行失敗時調用。
   * @param taskId 失敗的任務 ID
   * @param graph 任務依賴圖
   * @param queue 就緒任務隊列
   */
  onTaskFailed(taskId: string, graph: TaskGraph, queue: IReadyQueue): void {
    logger.error(`Task failed: ${taskId}`, { type: 'LIFECYCLE' });
    this.runningTaskIds.delete(taskId);
    this.queuedTaskIds.delete(taskId);
  }

  /**
   * 重置調度器狀態
   */
  reset(): void {
    this.queuedTaskIds.clear();
    this.runningTaskIds.clear();
  }
}
