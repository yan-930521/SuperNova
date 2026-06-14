import { TaskGraphData, TaskStatus } from '../../infra/types/task';
import { IdGenerator } from '../../utils/IdGenerator';
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
    public readonly id: string = IdGenerator.graph(),
    public phases: string[] = [],
    public currentPhaseIndex: number = 0
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

    // 暫時添加依賴進行檢查
    const children = this.adjList.get(parentId)!;
    const isNew = !children.has(childId);
    
    if (isNew) {
      children.add(childId);
      const currentInDegree = this.inDegreeMap.get(childId) || 0;
      this.inDegreeMap.set(childId, currentInDegree + 1);

      // 檢查是否產生死循環
      if (this.detectCycle()) {
        // 回退變更
        children.delete(childId);
        this.inDegreeMap.set(childId, currentInDegree);
        throw new Error(`[TaskGraph] Circular dependency detected: ${parentId} -> ${childId}`);
      }
    }
  }

  /**
   * 獲取目前就緒的任務 (入度為 0)
   * @param phase 可選的階段過濾 (e.g., 'PLANNING')
   */
  public getReadyTasks(phase?: string): Task[] {
    const readyTasks: Task[] = [];
    for (const [taskId, inDegree] of this.inDegreeMap.entries()) {
      if (inDegree === 0) {
        const task = this.nodes.get(taskId);
        // 只有處於待命狀態的任務才算 Ready
        if (task && (task.status === 'pending' || task.status === 'ready')) {
          // 如果提供了 phase，則進行過濾
          if (phase && task.flow.currentPhase !== phase) {
            continue;
          }
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
   * 使用 Kahn's Algorithm 偵測死循環
   * 返回 true 表示存在循環
   */
  public detectCycle(): boolean {
    const tempInDegree = new Map<string, number>();
    const queue: string[] = [];
    let count = 0;

    // 1. 初始化臨時入度表
    for (const taskId of this.nodes.keys()) {
      const inDegree = this.calculateInitialInDegree(taskId);
      tempInDegree.set(taskId, inDegree);
      if (inDegree === 0) {
        queue.push(taskId);
      }
    }

    // 2. 拓撲排序掃描
    while (queue.length > 0) {
      const u = queue.shift()!;
      count++;

      const children = this.adjList.get(u);
      if (children) {
        for (const v of children) {
          const d = tempInDegree.get(v)! - 1;
          tempInDegree.set(v, d);
          if (d === 0) {
            queue.push(v);
          }
        }
      }
    }

    // 3. 如果處理過的節點數小於總節點數，說明有環
    return count < this.nodes.size;
  }

  /**
   * 計算初始入度 (僅用於 detectCycle)
   */
  private calculateInitialInDegree(taskId: string): number {
    let count = 0;
    for (const [parent, children] of this.adjList.entries()) {
      if (children.has(taskId)) {
        count++;
      }
    }
    return count;
  }

  /**
   * 從 JSON 資料還原結構
   */
  public loadData(data: TaskGraphData): void {
    this.nodes.clear();
    this.adjList.clear();
    this.inDegreeMap.clear();
    this.phases = data.phases || [];
    this.currentPhaseIndex = data.currentPhaseIndex || 0;

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

    // 3. 狀態對齊：根據節點狀態修正入度表
    // 理由：若父任務在持久化前已完成，還原後需手動解鎖子任務的入度。
    for (const task of this.nodes.values()) {
      if (task.status === 'completed') {
        this.handleTaskCompletion(task.id);
      }
    }
  }

  /**
   * 轉換為可持久化的 DTO
   */
  public toDTO(): TaskGraphData {
    return {
      nodes: this.getAllTasks().map(task => task.toDTO()),
      phases: this.phases,
      currentPhaseIndex: this.currentPhaseIndex
    };
  }
}