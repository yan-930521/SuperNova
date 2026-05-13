/**
 * 就緒隊列接口 (ReadyQueue)
 * 用於 DAG 任務並行調度。
 */
export interface IReadyQueue {
  /** 將任務推入隊列 */
  push(taskId: string): void;
  /** 從隊列中取出下一個可執行的任務 */
  pop(): string | null;
  /** 獲取當前隊列中積壓的任務總數 */
  readonly length: number;
  /** 獲取當前隊列中的所有任務 ID 副本 */
  getItems(): string[];
  /** 清空隊列 */
  clear(): void;
}

