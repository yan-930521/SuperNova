import { TaskFlowDTO } from '../../../infra/types/task';

/**
 * TaskFlow (任務流轉狀態機) - 領域物件
 * 負責維護單一任務的 PDCA 生命週期狀態。
 */
export class TaskFlow {
  constructor(
    public templateType: string,
    public currentPhase: string,
    public phases: string[],
    public history: Array<{ phase: string; timestamp: number; result: string }> = [],
    public isEscalated: boolean = false
  ) {}

  /**
   * 遷徙到下一個階段
   * @param result 當前階段的執行結果 ('success', 'fail', 'escalate')
   */
  public transition(result: string): string {
    // 1. 紀錄歷史
    this.history.push({
      phase: this.currentPhase,
      timestamp: Date.now(),
      result
    });

    // 2. 獲取下一個階段的邏輯索引
    const currentIndex = this.phases.indexOf(this.currentPhase);
    
    // 如果結果是成功，前進到下一階段
    if (result === 'success') {
      if (currentIndex < this.phases.length - 1) {
        this.currentPhase = this.phases[currentIndex + 1];
      } else {
        this.currentPhase = 'FINISH';
      }
    } 
    // 如果是失敗或上報，由 SA 或 AA 介入，目前維持現狀或標記異常
    else if (result === 'escalate') {
      this.isEscalated = true;
    }

    return this.currentPhase;
  }

  /**
   * 從 DTO 還原
   */
  public static fromDTO(dto: TaskFlowDTO): TaskFlow {
    return new TaskFlow(
      dto.templateType,
      dto.currentPhase,
      dto.phases,
      dto.history,
      dto.isEscalated
    );
  }

  /**
   * 轉換為 DTO
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
}
