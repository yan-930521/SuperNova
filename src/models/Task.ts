import { IAgentExecuteResult } from '../infra/types/agent';
import { MessageDTO } from '../infra/types/session';
import { TaskDTO, TaskStatus } from '../infra/types/task';

/**
 * Task (任務實體)
 * 負責處理單個任務的業務邏輯、狀態變更與結果處理。
 */
export class Task {
  public id: string;
  public sessionId: string;
  public chainId: string;
  public type: string;
  public goal: string;
  public description: string;
  public status: TaskStatus;
  public dependencies: string[] = [];
  public assignedAgentId?: string | null;
  public requiredCapabilities?: string[];
  public toolRouting?: any;
  public options?: any;
  public retryCount: number = 0;
  public history: MessageDTO[] = [];
  public metadata?: Record<string, any>;

  constructor(dto: TaskDTO) {
    this.id = dto.id;
    this.sessionId = dto.sessionId;
    this.chainId = dto.chainId;
    this.type = dto.type;
    this.goal = dto.goal;
    this.description = dto.description;
    this.status = dto.status;
    this.dependencies = dto.dependencies || [];
    this.assignedAgentId = dto.assignedAgentId;
    this.requiredCapabilities = dto.requiredCapabilities;
    this.toolRouting = dto.toolRouting;
    this.options = dto.options;
    this.retryCount = dto.retryCount || 0;
    this.history = dto.history || [];
    this.metadata = dto.metadata || {};
  }

  /**
   * 轉換為 DTO 用於持久化
   */
  toDTO(): TaskDTO {
    return {
      id: this.id,
      sessionId: this.sessionId,
      chainId: this.chainId,
      type: this.type,
      goal: this.goal,
      description: this.description,
      status: this.status,
      dependencies: this.dependencies,
      assignedAgentId: this.assignedAgentId,
      requiredCapabilities: this.requiredCapabilities,
      toolRouting: this.toolRouting,
      options: this.options,
      retryCount: this.retryCount,
      history: this.history,
      metadata: this.metadata,
    };
  }

  /**
   * 更新任務狀態
   */
  updateStatus(status: Task['status']): void {
    this.status = status;
  }

  /**
   * 設定執行結果
   */
  setResult(AEResult: IAgentExecuteResult): void {
    // 注入完整訊息，包括 初始SystemMessage
    if (AEResult.result && AEResult.result.history) {
      this.history.push(...AEResult.result.history);
    }
  }

  /**
   * 標記為失敗
   */
  fail(error?: string): void {
    this.metadata = { ...this.metadata, error };
  }
}
