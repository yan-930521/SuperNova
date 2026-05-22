import { ITaskNodeState, IOperationRecord, TaskStatus } from './types';

/**
 * TaskStore (執行層總帳)
 * 專門紀錄「執行細節」的類別。
 * 負責記錄每個任務的狀態變更以及詳細的操作日誌。
 */
export class TaskStore {
  private taskStates = new Map<string, ITaskNodeState>();

  /**
   * 更新任務狀態
   * @param taskId 任務 ID
   * @param status 新狀態
   */
  updateStatus(taskId: string, status: TaskStatus): void {
    const task = this.getOrCreate(taskId);
    task.status = status;
  }

  /**
   * 添加操作記錄
   * 將單次操作細節存入任務狀態中，並自動補上時間戳。
   * @param record 操作記錄 (不含時間戳)
   */
  addRecord(record: Omit<IOperationRecord, 'timestamp'>): void {
    const task = this.getOrCreate(record.taskId);
    task.records.push({ ...record, timestamp: Date.now() });
  }

  /**
   * 獲取任務狀態
   * @param taskId 任務 ID
   * @returns 任務狀態對象，若不存在則返回 undefined
   */
  getTask(taskId: string): ITaskNodeState | undefined {
    return this.taskStates.get(taskId);
  }

  /**
   * 獲取或創建任務狀態對象 (內部私有)
   * @param taskId 任務 ID
   * @returns 任務狀態對象
   */
  private getOrCreate(taskId: string): ITaskNodeState {
    let task = this.taskStates.get(taskId);
    if (!task) {
      task = {
        id: taskId,
        type: 'default',
        goal: '',
        status: 'pending',
        records: [],
        dependencies: []
      };
      this.taskStates.set(taskId, task);
    }
    return task;
  }
}
