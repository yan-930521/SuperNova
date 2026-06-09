import { BaseTaskFlow } from './BaseTaskFlow';

/**
 * ExploratoryFlow (並行探索流程)
 * 軌跡：READY -> PLANNING -> DOING -> CHECKING -> ACTING -> FINISH
 */
export class ExploratoryFlow extends BaseTaskFlow {
  constructor(currentPhase: string = 'READY') {
    super(
      'Exploratory',
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
