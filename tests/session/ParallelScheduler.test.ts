import { ParallelScheduler } from '../../src/session/ParallelScheduler';
import { TaskGraph } from '../../src/session/TaskGraph';
import type { IReadyQueue } from '../../interfaces/session/IReadyQueue';

/**
 * 簡易的 ReadyQueue 實作，用於測試。
 */
class MockReadyQueue implements IReadyQueue {
  private queue: string[] = [];

  push(taskId: string): void {
    this.queue.push(taskId);
  }

  pop(): string | null {
    return this.queue.shift() || null;
  }

  get length(): number {
    return this.queue.length;
  }

  get items(): string[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }
}

describe('ParallelScheduler', () => {
  let graph: TaskGraph;
  let queue: MockReadyQueue;
  let scheduler: ParallelScheduler;

  beforeEach(() => {
    graph = new TaskGraph();
    queue = new MockReadyQueue();
    scheduler = new ParallelScheduler();
  });

  test('初始調度應正確填充 ReadyQueue', () => {
    graph.addTask('A');
    graph.addTask('B');
    graph.addTask('C');
    graph.addDependency('A', 'B');

    // A 是入度 0, C 是入度 0
    scheduler.schedule(graph, queue);

    expect(queue.length).toBe(2);
    expect(queue.items).toContain('A');
    expect(queue.items).toContain('C');
  });

  test('重複調度不應導致重複排隊', () => {
    graph.addTask('A');
    scheduler.schedule(graph, queue);
    scheduler.schedule(graph, queue);

    expect(queue.length).toBe(1);
    expect(queue.items).toEqual(['A']);
  });

  test('任務完成後應自動調度後續任務', () => {
    graph.addTask('A');
    graph.addTask('B');
    graph.addDependency('A', 'B');

    // 初始調度，只有 A 進入隊列
    scheduler.schedule(graph, queue);
    expect(queue.items).toEqual(['A']);

    // A 完成
    scheduler.onTaskCompleted('A', graph, queue);

    // B 應被解鎖並進入隊列
    expect(queue.items).toEqual(['A', 'B']);
  });

  test('多級依賴的自動解鎖測試', () => {
    graph.addTask('A');
    graph.addTask('B');
    graph.addTask('C');
    graph.addDependency('A', 'B');
    graph.addDependency('B', 'C');

    scheduler.schedule(graph, queue);
    expect(queue.items).toEqual(['A']);

    scheduler.onTaskCompleted('A', graph, queue);
    expect(queue.items).toEqual(['A', 'B']);

    scheduler.onTaskCompleted('B', graph, queue);
    expect(queue.items).toEqual(['A', 'B', 'C']);
  });

  test('並行任務解鎖測試', () => {
    graph.addTask('Start');
    graph.addTask('P1');
    graph.addTask('P2');
    graph.addTask('End');

    graph.addDependency('Start', 'P1');
    graph.addDependency('Start', 'P2');
    graph.addDependency('P1', 'End');
    graph.addDependency('P2', 'End');

    scheduler.schedule(graph, queue);
    expect(queue.items).toEqual(['Start']);

    scheduler.onTaskCompleted('Start', graph, queue);
    expect(queue.items).toContain('P1');
    expect(queue.items).toContain('P2');
    expect(queue.length).toBe(3); // Start, P1, P2

    // End 還沒解鎖，因為 P1, P2 都還沒完成
    scheduler.onTaskCompleted('P1', graph, queue);
    expect(queue.length).toBe(3); 
    
    // P2 完成，解鎖 End
    scheduler.onTaskCompleted('P2', graph, queue);
    expect(queue.items).toContain('End');
    expect(queue.length).toBe(4);
  });

  test('已開始執行的任務不應被重複調度', () => {
    graph.addTask('A');
    scheduler.schedule(graph, queue);
    expect(queue.items).toEqual(['A']);

    // 模擬從隊列取出並開始執行
    queue.pop();
    scheduler.onTaskStarted('A');

    // 再次調度，不應重複將 A 加入隊列
    scheduler.schedule(graph, queue);
    expect(queue.length).toBe(0);
  });

  test('任務失敗後應清理狀態以便重新調度或停止', () => {
    graph.addTask('A');
    scheduler.schedule(graph, queue);
    expect(queue.items).toEqual(['A']);

    queue.pop();
    scheduler.onTaskStarted('A');

    // 失敗
    scheduler.onTaskFailed('A', graph, queue);

    // 再次調度，由於 queuedTaskIds 已清理，A 應該可以被重新調度
    scheduler.schedule(graph, queue);
    expect(queue.items).toEqual(['A']);
  });
});
