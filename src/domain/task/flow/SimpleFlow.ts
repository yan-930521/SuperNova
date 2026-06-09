import { BaseTaskFlow } from './BaseTaskFlow';

/**
 * SimpleFlow (快速執行流程)
 * 軌跡：READY -> DOING -> FINISH
 */
export class SimpleFlow extends BaseTaskFlow {
  constructor(currentPhase: string = 'READY') {
    super(
      'Simple',
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
