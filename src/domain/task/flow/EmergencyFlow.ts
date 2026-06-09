import { BaseTaskFlow } from './BaseTaskFlow';

/**
 * EmergencyFlow (緊急修復流程)
 * 軌跡：READY -> DOING (reAct) -> CHECKING -> ACTING -> FINISH
 * 跳過 PLANNING 階段。
 */
export class EmergencyFlow extends BaseTaskFlow {
  constructor(currentPhase: string = 'READY') {
    super(
      'Emergency',
      currentPhase,
      ['READY', 'DOING', 'CHECKING', 'ACTING']
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
    return this.currentPhase;
  }
}
