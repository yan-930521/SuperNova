import { TaskFlowDTO } from '../../../infra/types/task';

/**
 * BaseTaskFlow (任務流轉抽象基底) - SuperNova 0.4.0
 * 負責定義任務 PDCA 生命週期的共通行為與屬性。
 */
export abstract class BaseTaskFlow {
  /** 狀態機變遷歷史 */
  public history: Array<{ phase: string; timestamp: number; result: string }> = [];
  /** 是否已被 SA 介入換檔 */
  public isEscalated: boolean = false;

  constructor(
    /** 模板類型名稱 */
    public readonly templateType: string,
    /** 當前執行階段 */
    public currentPhase: string,
    /** 定義好的有序階段序列 */
    public readonly phases: string[]
  ) {}

  /**
   * 驅動狀態機前進到下一階段 (由子類實作具體策略)
   * @param result 當前階段結果 ('success', 'fail', 'escalate')
   */
  public nextPhase(result: string): string {
    // 1. 紀錄歷史軌跡，確保決策可被 ActingAgent 追蹤
    this.history.push({
      phase: this.currentPhase,
      timestamp: Date.now(),
      result
    });

    // 2. 處理換檔標記
    if (result === 'escalate') {
      this.isEscalated = true;
      return this.currentPhase; // 保持現狀，等待 SA 指令
    }

    // 3. 執行遷徙邏輯
    return this.onTransition(result);
  }

  /**
   * 子類需實作的具體遷徙規則
   */
  protected abstract onTransition(result: string): string;

  /**
   * 轉換為可持久化的 DTO
   */
  public toDTO(): TaskFlowDTO {
    return {
      templateType: this.templateType,
      currentPhase: this.currentPhase,
      phases: this.phases,
      history: this.history,
      isEscalated: this.isEscalated
    };
  }

  /**
   * 從 DTO 還原歷史狀態
   */
  public restoreFromDTO(dto: TaskFlowDTO): void {
    this.currentPhase = dto.currentPhase;
    this.history = dto.history || [];
    this.isEscalated = dto.isEscalated || false;
  }
}
