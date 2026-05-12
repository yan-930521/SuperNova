import type { ISession } from '../../interfaces/session/ISession';
import type { IMiddleware } from '../../interfaces/session/IMiddleware';
import { MiddlewareChain } from './MiddlewareChain';
import { TaskGraph } from './TaskGraph';
import { ParallelScheduler } from './ParallelScheduler';
import { ReadyQueue } from './ReadyQueue';
import type { IReadyQueue } from '../../interfaces/session/IReadyQueue';
import type { ISnapshotManager } from '../../interfaces/infra/ISnapshotManager';
import type { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';

/**
 * 會話基礎實作類
 * 提供 ISession 接口的核心功能，包括中間件管理與任務調度。
 */
export class BaseSession implements ISession {
  public status: string = 'IDLE';
  protected toolChain: MiddlewareChain = new MiddlewareChain();
  protected mutationChain: MiddlewareChain = new MiddlewareChain();

  /** 任務依賴圖 */
  public taskGraph: TaskGraph = new TaskGraph();
  /** 並行調度器 */
  public scheduler: ParallelScheduler = new ParallelScheduler();
  /** 就緒任務隊列 */
  public readyQueue: IReadyQueue = new ReadyQueue();

  /** 參與此會話的 Agent ID 列表 */
  protected agentIds: string[] = [];
  /** 快照管理器 */
  public snapshotManager?: ISnapshotManager;
  /** Agent 註冊表 (用於快照時獲取 Agent 狀態) */
  public agentRegistry?: IAgentRegistry;

  /** 任務完成計數 (用於快照索引) */
  private completedTaskCount: number = 0;

  constructor(
    public id: string,
    public goal: string
  ) {}

  /**
   * 註冊參與會話的 Agent
   */
  addAgent(agentId: string): void {
    if (!this.agentIds.includes(agentId)) {
      this.agentIds.push(agentId);
    }
  }

  /**
   * 註冊中間件
   */
  use(pipeline: 'TOOL' | 'MUTATION', middleware: IMiddleware): void {
    if (pipeline === 'TOOL') {
      this.toolChain.use(middleware);
    } else if (pipeline === 'MUTATION') {
      this.mutationChain.use(middleware);
    }
  }

  /**
   * 核心循環
   * 調用調度器填充隊列，並模擬並行執行就緒任務。
   */
  async tick(): Promise<void> {
    console.log(`Session ${this.id} ticking...`);

    // 1. 調用調度器，根據 TaskGraph 狀態填充 ReadyQueue
    this.scheduler.schedule(this.taskGraph, this.readyQueue);

    // 2. 從 ReadyQueue 中取出所有當前就緒的任務
    const tasksToExecute: string[] = [];
    let taskId: string | null;
    while ((taskId = this.readyQueue.pop()) !== null) {
      tasksToExecute.push(taskId);
    }

    // 3. 執行任務
    for (const id of tasksToExecute) {
      console.log(`[BaseSession] Executing task: ${id}`);
      
      // 模擬任務成功完成
      await this.onTaskSuccess(id);
    }
  }

  /**
   * 處理任務成功完成
   */
  private async onTaskSuccess(taskId: string): Promise<void> {
    // 1. 更新調度器與 TaskGraph
    this.scheduler.onTaskCompleted(taskId, this.taskGraph, this.readyQueue);
    this.completedTaskCount++;

    // 2. 自動觸發快照
    if (this.snapshotManager) {
      console.log(`[BaseSession] Task ${taskId} completed. Triggering snapshot...`);
      await this.snapshotManager.snapshot(this, {
        lastTaskId: taskId,
        taskIndex: this.completedTaskCount
      });
    }
  }

  async exportLog(): Promise<string> {
    return "";
  }

  toJSON(): Record<string, any> {
    const agentsData: Record<string, any> = {};
    if (this.agentRegistry) {
      for (const aid of this.agentIds) {
        const agent = this.agentRegistry.getAgent(aid);
        if (agent) {
          agentsData[aid] = agent.toJSON();
        }
      }
    }

    return {
      id: this.id,
      goal: this.goal,
      status: this.status,
      taskGraph: this.taskGraph.toJSON(),
      agentIds: this.agentIds,
      agents: agentsData, // 快照時保存 Agent 狀態
      completedTaskCount: this.completedTaskCount
    };
  }

  async loadFromJSON(data: Record<string, any>): Promise<void> {
    this.id = data.id || this.id;
    this.goal = data.goal || this.goal;
    this.status = data.status || this.status;
    this.agentIds = data.agentIds || [];
    this.completedTaskCount = data.completedTaskCount || 0;

    if (data.taskGraph) {
      this.taskGraph.loadFromJSON(data.taskGraph);
    }

    // 恢復 Agent 狀態
    if (data.agents && this.agentRegistry) {
      for (const [aid, agentData] of Object.entries(data.agents)) {
        let agent = this.agentRegistry.getAgent(aid);
        if (!agent) {
          console.warn(`[BaseSession] Agent ${aid} not found in registry during load.`);
        } else {
          await agent.initFromJSON(agentData as Record<string, any>);
        }
      }
    }

    // 重新填充 ReadyQueue
    this.readyQueue.clear();
    this.scheduler.schedule(this.taskGraph, this.readyQueue);
  }

  async snapshot(): Promise<string> {
    if (!this.snapshotManager) {
      throw new Error("SnapshotManager not configured for this session.");
    }
    return await this.snapshotManager.snapshot(this, { 
      manual: true,
      taskIndex: this.completedTaskCount 
    });
  }

  async rollback(checkpointId: string): Promise<void> {
    if (!this.snapshotManager) {
      throw new Error("SnapshotManager not configured for this session.");
    }
    console.log(`[BaseSession] Rolling back to ${checkpointId}`);
    await this.snapshotManager.rollback(this, checkpointId);
    
    // Rollback 後必須重置隊列並重新調度
    this.readyQueue.clear();
    this.scheduler.schedule(this.taskGraph, this.readyQueue);
  }
}
