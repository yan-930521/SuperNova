import { Task } from './Task';
import { TaskStatus } from '../../infra/types/task';

/**
 * 任務圖資料結構介面
 */
export interface TaskGraphData {
  nodes: Task[];
  milestones: string[];
  currentMilestoneIndex: number;
}

/**
 * TaskGraph (任務圖) - 純領域實體
 * 負責維護任務（節點）與依賴（邊）的邏輯關係。
 * 使用入度 (In-degree) 算法來計算任務的就緒狀態。
 * 遵循領域純粹性：不依賴任何外部 IO、日誌或 Runtime。
 */
export class TaskGraph {
  /** 節點存儲：taskId -> Task Entity */
  private nodes = new Map<string, Task>();
  /** 相鄰串列：parentId -> Set of childTaskIds */
  private adjList = new Map<string, Set<string>>();
  /** 入度表：taskId -> number of incomplete dependencies */
  private inDegreeMap = new Map<string, number>();

  /**
   * 獲取圖中任務的總數量
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * 獲取所有任務實體
   */
  public getAllTasks(): Task[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 添加任務節點
   * @param task 任務實體
   */
  public addTask(task: Task): void {
    if (this.nodes.has(task.id)) return;

    this.nodes.set(task.id, task);
    this.adjList.set(task.id, new Set());
    
    // 初始化入度，根據任務目前的 dependencies 計算
    // 注意：這裡只計算「還沒完成」的依賴
    this.inDegreeMap.set(task.id, 0);
  }

  /**
   * 建立依賴關係
   * @param parentId 前置任務 ID
   * @param childId 後續任務 ID
   */
  public addDependency(parentId: string, childId: string): void {
    if (!this.nodes.has(parentId) || !this.nodes.has(childId)) {
      throw new Error(`[TaskGraph] Cannot add dependency: node ${parentId} or ${childId} not found`);
    }

    if (this.isReachable(childId, parentId)) {
      throw new Error(`[TaskGraph] Circular dependency detected: ${childId} -> ${parentId}`);
    }

    const children = this.adjList.get(parentId)!;
    if (!children.has(childId)) {
      children.add(childId);
      
      // 更新子任務的入度
      const currentInDegree = this.inDegreeMap.get(childId) || 0;
      this.inDegreeMap.set(childId, currentInDegree + 1);
    }
  }

  /**
   * 獲取當前所有入度為 0 的任務 ID（即就緒節點）
   */
  public getReadyTasks(): string[] {
    const readyTasks: string[] = [];
    for (const [taskId, inDegree] of this.inDegreeMap.entries()) {
      if (inDegree === 0) {
        const task = this.nodes.get(taskId);
        // 只有 PENDING 或 READY 狀態的節點才算作待執行
        if (task && (task.status === TaskStatus.PENDING || task.status === TaskStatus.READY)) {
          readyTasks.push(taskId);
        }
      }
    }
    return readyTasks;
  }

  /**
   * 標記任務完成，並解鎖後續依賴任務
   */
  public completeTask(taskId: string): void {
    const task = this.nodes.get(taskId);
    if (!task) throw new Error(`[TaskGraph] Task ${taskId} not found`);

    task.updateStatus(TaskStatus.COMPLETED);

    // 關鍵：將此節點從入度表中移除，不再視為待執行
    this.inDegreeMap.delete(taskId);

    // 更新所有後續任務的入度
    const children = this.adjList.get(taskId);
    if (children) {
      for (const childId of children) {
        const currentInDegree = this.inDegreeMap.get(childId);
        if (currentInDegree !== undefined) {
          this.inDegreeMap.set(childId, Math.max(0, currentInDegree - 1));
        }
      }
    }
  }

  /**
   * 使用 DFS 檢查循環依賴
   */
  private isReachable(start: string, target: string, visited = new Set<string>()): boolean {
    if (start === target) return true;
    visited.add(start);
    const children = this.adjList.get(start);
    if (children) {
      for (const child of children) {
        if (!visited.has(child)) {
          if (this.isReachable(child, target, visited)) return true;
        }
      }
    }
    return false;
  }

  /**
   * 取得特定任務實體
   */
  public getTask(taskId: string): Task | undefined {
    return this.nodes.get(taskId);
  }

  /**
   * 從外部 JSON 數據重建圖結構
   */
  public loadData(data: TaskGraphData): void {
    this.nodes.clear();
    this.adjList.clear();
    this.inDegreeMap.clear();

    // 1. 載入節點
    for (const task of data.nodes) {
      this.addTask(task);
    }

    // 2. 重建邊與計算入度
    for (const task of data.nodes) {
      for (const parentId of task.dependencies) {
        try {
          this.addDependency(parentId, task.id);
        } catch (e) {
          // 靜默處理，或由上層過濾無效依賴
        }
      }
    }
  }
}
