import { BaseSession } from '../session/BaseSession';
import { TaskDTO, TaskStatus } from '../../infra/types/task';
import { IAgentExecuteResult } from '../../infra/types/agent';

/**
 * 任務實體 (Task)
 * 繼承自 BaseSession，代表二級總帳（Agent 執行的思考與行為軌跡）。
 * 實現「任務即會話」的概念。
 */
export class Task extends BaseSession {
  public dependencies: string[] = [];
  public assignedAgentId: string | null = null;
  public requiredCapabilities: string[] = [];
  public retryCount: number = 0;

  constructor(
    id: string,
    public readonly chainId: string,
    public readonly sessionId: string, // 父會話 ID
    public readonly goal: string,
    public readonly description: string,
    public readonly type: string = 'work',
    status: TaskStatus = TaskStatus.PENDING
  ) {
    super(id, status);
  }

  /**
   * 更新任務狀態
   */
  public updateStatus(status: TaskStatus): void {
    this.status = status;
  }

  /**
   * 從代理執行結果中吸收歷史軌跡
   * 這是「任務即會話」的核心：Worker 的思考過程會被併入此 Task 的 Session 歷史中。
   */
  public absorbExecuteResult(aeResult: IAgentExecuteResult): void {
    if (aeResult.result && aeResult.result.history) {
      // 過濾掉可能的重複訊息，併入歷史
      this.history.push(...aeResult.result.history);
    }
    
    if (aeResult.status === 'success') {
      this.updateStatus(TaskStatus.COMPLETED);
    } else {
      this.updateStatus(TaskStatus.FAILED);
      this.metadata.lastError = aeResult.error;
    }
  }

  /**
   * 從 DTO 還原為實體實例
   */
  public static fromDTO(dto: TaskDTO): Task {
    const task = new Task(
      dto.id,
      dto.chainId,
      dto.sessionId,
      dto.goal,
      dto.description,
      dto.type,
      dto.status
    );
    task.dependencies = dto.dependencies || [];
    task.assignedAgentId = dto.assignedAgentId || null;
    task.requiredCapabilities = dto.requiredCapabilities || [];
    task.retryCount = dto.retryCount || 0;
    task.metadata = dto.metadata || {};
    
    // 處理歷史紀錄
    if (dto.history) {
      task.setHistory(dto.history);
    }
    
    return task;
  }

  /**
   * 轉換為 DTO 用於持久化
   */
  public toDTO(): TaskDTO {
    return {
      id: this.id,
      chainId: this.chainId,
      sessionId: this.sessionId,
      goal: this.goal,
      description: this.description,
      type: this.type,
      status: this.status as TaskStatus,
      dependencies: this.dependencies,
      assignedAgentId: this.assignedAgentId,
      requiredCapabilities: this.requiredCapabilities,
      retryCount: this.retryCount,
      history: this.history,
      metadata: this.metadata as Record<string, any>
    };
  }
}
