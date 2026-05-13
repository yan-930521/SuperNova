import { ITaskNode, ITaskGraph } from '../../interfaces/agent/ITaskPlanEngine';

/**
 * TaskGraph 負責維護任務（節點）與依賴（邊）的關係。
 * 使用入度 (In-degree) 算法來管理任務的就緒狀態。
 */
export class TaskGraph {
  private nodes = new Map<string, ITaskNode>();
  private adjList = new Map<string, Set<string>>();
  private inDegreeMap = new Map<string, number>();

  /**
   * 獲取圖中剩餘任務的數量。
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * 添加任務節點。
   * @param taskId 任務唯一標識
   * @param node 任務節點數據 (部分提供)
   */
  addTask(taskId: string, node: Partial<ITaskNode> = {}): void {
    const isNew = !this.nodes.has(taskId);
    
    // 提供預設值以補齊 ITaskNode
    const fullNode: ITaskNode = {
      id: taskId,
      type: node.type || 'default',
      goal: node.goal || taskId,
      dependencies: node.dependencies || [],
      status: node.status || 'pending',
      ...node
    };

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
    if (!this.nodes.has(taskId)) {
      throw new Error(`Task ${taskId} not found`);
    }

    const successors = this.adjList.get(taskId);
    if (successors) {
      for (const successor of successors) {
        const currentInDegree = this.inDegreeMap.get(successor)!;
        this.inDegreeMap.set(successor, currentInDegree - 1);
      }
    }

    this.nodes.delete(taskId);
    this.adjList.delete(taskId);
    this.inDegreeMap.delete(taskId);
  }

  /**
   * 獲取任務節點。
   * @param taskId 任務唯一標識
   */
  getTask(taskId: string): ITaskNode | undefined {
    return this.nodes.get(taskId);
  }

  /**
   * 序列化為 JSON
   */
  toJSON(): ITaskGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      milestones: [], // 這裡暫時留空，因為 TaskGraph 內部不維護里程碑列表
      currentMilestoneIndex: 0
    };
  }

  /**
   * 從 ITaskGraph 數據對象加載狀態
   */
  loadFromJSON(data: Partial<ITaskGraph>): void {
    this.nodes.clear();
    this.adjList.clear();
    this.inDegreeMap.clear();

    if (!data.nodes) return;

    // 1. 先註冊所有節點
    data.nodes.forEach(node => {
      this.nodes.set(node.id, node);
      this.adjList.set(node.id, new Set());
      this.inDegreeMap.set(node.id, 0);
    });

    // 2. 建立邊與計算入度
    data.nodes.forEach(node => {
      node.dependencies.forEach(parentId => {
        const successors = this.adjList.get(parentId);
        if (successors) {
          if (!successors.has(node.id)) {
            successors.add(node.id);
            const currentInDegree = this.inDegreeMap.get(node.id) || 0;
            this.inDegreeMap.set(node.id, currentInDegree + 1);
          }
        } else {
          console.warn(`[TaskGraph] Task ${node.id} depends on non-existent task ${parentId}`);
        }
      });
    });
  }
}
