import { TaskStatus, TaskGraphData } from '../../infra/types/task';
import { Task } from './Task';

/**
 * TaskGraph (任務圖) - 領域實體
 * 負責管理一組任務間的依賴關係 (Directed Acyclic Graph)。
 * 在 0.4.0 架構中，它是「分形架構」的核心，一個 Task 可以持有一個 TaskGraph 作為其 subGraph。
 */
export class TaskGraph {
  /** 節點存儲：taskId -> Task Entity */
  private nodes = new Map<string, Task>();
  /** 相鄰串列：parentId -> Set of childTaskIds */
  private adjList = new Map<string, Set<string>>();
  /** 入度表：taskId -> number of incomplete dependencies */
  private inDegreeMap = new Map<string, number>();

  constructor(
    public readonly id: string = `graph_${Date.now()}`,
    public milestones: string[] = [],
    public currentMilestoneIndex: number = 0
  ) {}

  /**
   * 獲取所有任務實體
   */
  public getAllTasks(): Task[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 添加任務節點
   */
  public addTask(task: Task): void {
    if (this.nodes.has(task.id)) return;

    this.nodes.set(task.id, task);
    this.adjList.set(task.id, new Set());
    
    // 初始化入度
    this.inDegreeMap.set(task.id, 0);
  }

  /**
   * 建立依賴關係
   */
  public addDependency(parentId: string, childId: string): void {
    if (!this.nodes.has(parentId) || !this.nodes.has(childId)) {
      throw new Error(`[TaskGraph] Node ${parentId} or ${childId} not found`);
    }

    if (this.isReachable(childId, parentId)) {
      throw new Error(`[TaskGraph] Circular dependency detected: ${childId} -> ${parentId}`);
    }

    const children = this.adjList.get(parentId)!;
    if (!children.has(childId)) {
      children.add(childId);
      const currentInDegree = this.inDegreeMap.get(childId) || 0;
      this.inDegreeMap.set(childId, currentInDegree + 1);
    }
  }

  /**
   * 獲取目前就緒的任務 (入度為 0)
   */
  public getReadyTasks(): Task[] {
    const readyTasks: Task[] = [];
    for (const [taskId, inDegree] of this.inDegreeMap.entries()) {
      if (inDegree === 0) {
        const task = this.nodes.get(taskId);
        // 只有處於待命狀態的任務才算 Ready
        if (task && (task.status === TaskStatus.PENDING || task.status === TaskStatus.READY)) {
          readyTasks.push(task);
        }
      }
    }
    return readyTasks;
  }

  /**
   * 當任務完成時，解鎖後續依賴
   */
  public handleTaskCompletion(taskId: string): void {
    const children = this.adjList.get(taskId);
    if (children) {
      for (const childId of children) {
        const currentInDegree = this.inDegreeMap.get(childId);
        if (currentInDegree !== undefined) {
          this.inDegreeMap.set(childId, Math.max(0, currentInDegree - 1));
        }
      }
    }
    // 從入度表中移除已完成節點
    this.inDegreeMap.delete(taskId);
  }

  /**
   * DFS 循環檢查
   */
  private isReachable(start: string, target: string, visited = new Set<string>()): boolean {
    if (start === target) return true;
    visited.add(start);
    const children = this.adjList.get(start);
    if (children) {
      for (const child of children) {
        if (!visited.has(child) && this.isReachable(child, target, visited)) return true;
      }
    }
    return false;
  }

  /**
   * 從 JSON 資料還原結構
   */
  public loadData(data: TaskGraphData): void {
    this.nodes.clear();
    this.adjList.clear();
    this.inDegreeMap.clear();
    this.milestones = data.milestones || [];
    this.currentMilestoneIndex = data.currentMilestoneIndex || 0;

    // 1. 載入節點
    for (const nodeDto of data.nodes) {
      const task = Task.fromDTO(nodeDto);
      this.addTask(task);
    }

    // 2. 重建依賴
    for (const nodeDto of data.nodes) {
      for (const parentId of nodeDto.dependencies) {
        try {
          this.addDependency(parentId, nodeDto.id);
        } catch (e) {
          // 容錯處理：略過無效依賴
        }
      }
    }
  }

  /**
   * 轉換為可持久化的 DTO
   */
  public toDTO(): TaskGraphData {
    return {
      nodes: this.getAllTasks().map(task => task.toDTO()),
      milestones: this.milestones,
      currentMilestoneIndex: this.currentMilestoneIndex
    };
  }
}
