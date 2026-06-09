import { BaseTaskFlow } from './BaseTaskFlow';

/**
 * StandardFlow (標準 PDCA 流程)
 * 軌跡：READY -> PLANNING -> DOING -> CHECKING -> ACTING -> FINISH
 */
export class StandardFlow extends BaseTaskFlow {
  constructor(currentPhase: string = 'READY') {
    super(
      'Standard',
      currentPhase,
      ['READY', 'PLANNING', 'DOING', 'CHECKING', 'ACTING']
    );
  }

  protected onTransition(result: string): string {
    if (result === 'success') {
      const currentIndex = this.phases.indexOf(this.currentPhase);
      if (currentIndex < this.phases.length - 1) {
        this.currentPhase = this.phases[currentIndex + 1];
      } else {
        this.currentPhase = 'FINISH';
      }
    } 
    // 若失敗且不屬於 escalate，預設留在原階段或由 Scheduler 處理重試
    return this.currentPhase;
  }
}
