import { IReadyQueue } from '../../interfaces/session/IReadyQueue';
import { TaskGraph } from './TaskGraph';

/**
 * ParallelScheduler 負責將 TaskGraph 中已就緒的任務（入度為 0）推送至 ReadyQueue。
 * 它確保任務按依賴關係並行調度。
 */
export class ParallelScheduler {
  private queuedTaskIds = new Set<string>();

  /**
   * 掃描圖中所有入度為 0 且尚未排入隊列的任務並將其排入隊列。
   * @param graph 任務依賴圖
   * @param queue 就緒任務隊列
   */
  schedule(graph: TaskGraph, queue: IReadyQueue): void {
    const readyTasks = graph.getReadyTasks();
    for (const taskId of readyTasks) {
      if (!this.queuedTaskIds.has(taskId)) {
        console.log(`Scheduling task: ${taskId}`);
        queue.push(taskId);
        this.queuedTaskIds.add(taskId);
      }
    }
  }

  /**
   * 當任務完成時調用，更新圖狀態並調度新解鎖的任務。
   * @param taskId 已完成的任務 ID
   * @param graph 任務依賴圖
   * @param queue 就緒任務隊列
   */
  onTaskCompleted(taskId: string, graph: TaskGraph, queue: IReadyQueue): void {
    console.log(`Task completed: ${taskId}`);
    graph.completeTask(taskId);
    this.queuedTaskIds.delete(taskId);
    this.schedule(graph, queue);
  }
}
