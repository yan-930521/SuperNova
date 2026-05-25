import { TaskDTO, TaskStatus } from '../infra/types/task';

/**
 * Task (任務實體)
 * 負責處理單個任務的業務邏輯、狀態變更與結果處理。
 */
export class Task {
  public id: string;
  public sessionId: string;
  public type: string;
  public goal: string;
  public status: TaskStatus;
  public dependencies: string[] = [];
  public assignedAgentId?: string | null;
  public requiredCapabilities?: string[];
  public toolRouting?: any;
  public options?: any;
  public result?: any;
  public metadata?: Record<string, any>;

  constructor(dto: TaskDTO) {
    this.id = dto.id;
    this.sessionId = dto.sessionId;
    this.type = dto.type;
    this.goal = dto.goal;
    this.status = dto.status;
    this.dependencies = dto.dependencies || [];
    this.assignedAgentId = dto.assignedAgentId;
    this.requiredCapabilities = dto.requiredCapabilities;
    this.toolRouting = dto.toolRouting;
    this.options = dto.options;
    this.result = dto.result;
    this.metadata = dto.metadata || {};
  }

  /**
   * 轉換為 DTO 用於持久化
   */
  toDTO(): TaskDTO {
    return {
      id: this.id,
      sessionId: this.sessionId,
      type: this.type,
      goal: this.goal,
      status: this.status,
      dependencies: this.dependencies,
      assignedAgentId: this.assignedAgentId,
      requiredCapabilities: this.requiredCapabilities,
      toolRouting: this.toolRouting,
      options: this.options,
      result: this.result,
      metadata: this.metadata
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
  setResult(result: any): void {
    this.result = result;
    this.status = TaskStatus.COMPLETED;
  }

  /**
   * 標記為失敗
   */
  fail(error?: string): void {
    this.status = TaskStatus.FAILED;
    this.metadata = { ...this.metadata, error };
  }
}
