import { BaseTaskFlow } from './BaseTaskFlow';

/**
 * RecursiveFlow (遞歸拆解流程)
 * 軌跡：READY -> PLANNING -> DOING -> CHECKING -> ACTING -> FINISH
 */
export class RecursiveFlow extends BaseTaskFlow {
  constructor(currentPhase: string = 'READY') {
    super(
      'Recursive',
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
    return this.currentPhase;
  }
}
