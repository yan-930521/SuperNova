import { AgentEvent, AgentEvents } from '../../core/messaging/IBus';
import { BaseAgent } from '../BaseAgent';

/**
 * ActingAgent (改善者)
 */
export class ActingAgent extends BaseAgent {
  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Acting.Start, this.onActStart.bind(this));
  }

  private async onActStart(event: AgentEvent): Promise<void> {
    this.log(`[ActingAgent] started standardization for task: ${event.payload.taskId}`);
  }
}
