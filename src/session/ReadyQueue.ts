import type { IReadyQueue } from '../../interfaces/session/IReadyQueue';

/**
 * 簡單的就緒隊列實作
 */
export class ReadyQueue implements IReadyQueue {
  private queue: string[] = [];

  push(taskId: string): void {
    if (!this.queue.includes(taskId)) {
      this.queue.push(taskId);
    }
  }

  pop(): string | null {
    return this.queue.shift() || null;
  }

  get length(): number {
    return this.queue.length;
  }

  getItems(): string[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }
}
