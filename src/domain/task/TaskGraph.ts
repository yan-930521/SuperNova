import { TaskGraphData, TaskStatus } from '../../infra/types/task';
import { IdGenerator } from '../../utils/IdGenerator';
import { GraphValidator, IGraphEdge } from '../../utils/GraphValidator';
import { Task } from './Task';

/**
 * TaskGraph (任務圖) - 領域實體
 * 負責管理一組任務間的依賴關係 (Directed Acyclic Graph)。
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

      // 使用統一的驗證器檢查物理合法性
      const report = this.validate();
      if (!report.isValid) {
        // 回退變更
        children.delete(childId);
        this.inDegreeMap.set(childId, currentInDegree);
        throw new Error(`[TaskGraph] Dependency rejected: ${report.errors.join('; ')}`);
      }
    }
  }

  /**
   * 獲取目前就緒的任務 (入度為 0)
   */
  public getReadyTasks(phase?: string): Task[] {
    const readyTasks: Task[] = [];
    for (const [taskId, inDegree] of this.inDegreeMap.entries()) {
      if (inDegree === 0) {
        const task = this.nodes.get(taskId);
        if (task && (task.status === 'pending' || task.status === 'ready')) {
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
    this.inDegreeMap.delete(taskId);
  }

  /**
   * 調用統一驗證器進行物理檢查
   */
  public validate() {
    const edges: IGraphEdge[] = [];
    for (const [parentId, children] of this.adjList.entries()) {
      children.forEach(childId => {
        // 在 GraphValidator 中，sourceId 是依賴者，targetId 是被依賴者
        // 而在 TaskGraph 的邏輯中，parent 是被依賴者，child 是依賴者
        edges.push({ sourceId: childId, targetId: parentId });
      });
    }
    return GraphValidator.validate(Array.from(this.nodes.values()), edges);
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