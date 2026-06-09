import { BaseTaskFlow } from './BaseTaskFlow';

/**
 * InstantFlow (即時執行流程)
 * 軌跡：READY -> DOING -> FINISH
 */
export class InstantFlow extends BaseTaskFlow {
  constructor(currentPhase: string = 'READY') {
    super(
      'Instant',
      currentPhase,
      ['READY', 'DOING']
    );
  }

  protected onTransition(result: string): string {
    if (result === 'success') {
      if (this.currentPhase === 'READY') {
        this.currentPhase = 'DOING';
      } else {
        this.currentPhase = 'FINISH';
      }
    }
    return this.currentPhase;
  }
}
