import { AgentEvent, AgentEvents } from '../../core/messaging/IBus';
import { BaseAgent } from '../BaseAgent';

/**
 * PlanningAgent (規劃師)
 */
export class PlanningAgent extends BaseAgent {
  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Planning.Start, this.onPlanStart.bind(this));
  }

  private async onPlanStart(event: AgentEvent): Promise<void> {
    this.log(`[PlanningAgent] started for session: ${event.payload.sessionId}`);
  }
}
