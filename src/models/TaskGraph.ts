import { TaskNode, TaskGraphData, TaskStatus } from '../task/types';
import { recorder } from '../infra/LogManager';

/**
 * TaskGraph 負責維護任務（節點）與依賴（邊）的關係。
 * 使用入度 (In-degree) 算法來管理任務的就緒狀態。
 */
export class TaskGraph {
  private nodes = new Map<string, TaskNode>();
  private adjList = new Map<string, Set<string>>();
  private inDegreeMap = new Map<string, number>();

  /**
   * 獲取圖中剩餘任務的數量。
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * 獲取所有任務節點。
   */
  getAllTasks(): TaskNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 添加任務節點。
   * @param taskId 任務唯一標識
   * @param node 任務節點數據 (部分提供)
   */
  addTask(taskId: string, node: Partial<TaskNode> = {}): void {
    const isNew = !this.nodes.has(taskId);
    
    // 提供預設值以補齊 TaskNode
    const fullNode: TaskNode = {
      id: taskId,
      sessionId: node.sessionId || 'unknown',
      type: node.type || 'default',
      goal: node.goal || taskId,
      dependencies: node.dependencies || [],
      status: node.status || TaskStatus.PENDING,
      ...node
    } as TaskNode;

    this.nodes.set(taskId, fullNode);
    if (isNew) {
      this.adjList.set(taskId, new Set());
      this.inDegreeMap.set(taskId, 0);
    }
  }

  /**
   * 獲取特定任務的入度。
   * @param taskId 任務唯一標識
   */
  getInDegree(taskId: string): number {
    const inDegree = this.inDegreeMap.get(taskId);
    if (inDegree === undefined) {
      throw new Error(`Task ${taskId} not found in graph`);
    }
    return inDegree;
  }

  /**
   * 獲取當前所有入度為 0 的任務 ID。
   */
  getReadyTasks(): string[] {
    const readyTasks: string[] = [];
    for (const [taskId, inDegree] of this.inDegreeMap.entries()) {
      if (inDegree === 0) {
        readyTasks.push(taskId);
      }
    }
    return readyTasks;
  }

  /**
   * 建立依賴關係。
   * @param parentTaskId 父任務（前置任務）
   * @param childTaskId 子任務（後續任務）
   */
  addDependency(parentTaskId: string, childTaskId: string): void {
    if (!this.nodes.has(parentTaskId)) throw new Error(`Task ${parentTaskId} not found`);
    if (!this.nodes.has(childTaskId)) throw new Error(`Task ${childTaskId} not found`);

    if (this.isReachable(childTaskId, parentTaskId)) {
      throw new Error(`Circular dependency detected: ${childTaskId} -> ${parentTaskId}`);
    }

    const children = this.adjList.get(parentTaskId)!;
    if (!children.has(childTaskId)) {
      children.add(childTaskId);
      this.inDegreeMap.set(childTaskId, (this.inDegreeMap.get(childTaskId) || 0) + 1);
    }
  }

  /**
   * 使用 DFS 檢查是否存在從 start 到 target 的路徑（用於循環檢測）。
   */
  private isReachable(start: string, target: string, visited = new Set<string>()): boolean {
    if (start === target) return true;
    visited.add(start);
    const successors = this.adjList.get(start);
    if (successors) {
      for (const successor of successors) {
        if (!visited.has(successor)) {
          if (this.isReachable(successor, target, visited)) return true;
        }
      }
    }
    return false;
  }

  /**
   * 標記任務完成，並更新其後續任務的入度。
   * @param taskId 任務唯一標識
   */
  completeTask(taskId: string): void {
    const node = this.nodes.get(taskId);
    if (!node) {
      throw new Error(`Task ${taskId} not found`);
    }

    node.status = TaskStatus.COMPLETED;

    const successors = this.adjList.get(taskId);
    if (successors) {
      for (const successor of successors) {
        const currentInDegree = this.inDegreeMap.get(successor)!;
        this.inDegreeMap.set(successor, Math.max(0, currentInDegree - 1));
      }
    }

    // 關鍵修正：不再刪除節點，以便後續查詢 (符合 ARCH.md 執行總帳原則)
    // 但必須從入度表中移除，否則 getReadyTasks 會一直抓到它
    this.inDegreeMap.delete(taskId);
  }

  /**
   * 獲取任務節點。
   * @param taskId 任務唯一標識
   */
  getTask(taskId: string): TaskNode | undefined {
    return this.nodes.get(taskId);
  }

  /**
   * 序列化為 JSON
   */
  toJSON(): TaskGraphData {
    return {
      nodes: Array.from(this.nodes.values()),
      milestones: [], // 這裡暫時留空，因為 TaskGraph 內部不維護里程碑列表
      currentMilestoneIndex: 0
    };
  }

  /**
   * 從 TaskGraphData 數據對象加載狀態
   */
  loadFromJSON(data: Partial<TaskGraphData>): void {
    this.nodes.clear();
    this.adjList.clear();
    this.inDegreeMap.clear();

    if (!data.nodes) return;

    // 1. 先註冊所有節點
    data.nodes.forEach((node: TaskNode) => {
      this.nodes.set(node.id, node);
      this.adjList.set(node.id, new Set());
      this.inDegreeMap.set(node.id, 0);
    });

    // 2. 建立邊與計算入度
    data.nodes.forEach((node: TaskNode) => {
      node.dependencies.forEach((parentId: string) => {
        const successors = this.adjList.get(parentId);
        if (successors) {
          if (!successors.has(node.id)) {
            successors.add(node.id);
            const currentInDegree = this.inDegreeMap.get(node.id) || 0;
            this.inDegreeMap.set(node.id, currentInDegree + 1);
          }
        } else {
          recorder.warn(`[TaskGraph] Task ${node.id} depends on non-existent task ${parentId}`, { type: 'SYSTEM' });
        }
      });
    });
  }
}
