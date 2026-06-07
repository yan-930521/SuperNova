import { AgentEvent, AgentEvents } from '../../core/messaging/IBus';
import { BaseAgent } from '../BaseAgent';

/**
 * CheckingAgent (審核者)
 */
export class CheckingAgent extends BaseAgent {
  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Checking.Start, this.onCheckStart.bind(this));
  }

  private async onCheckStart(event: AgentEvent): Promise<void> {
    this.log(`[CheckingAgent] started checking task: ${event.payload.taskId}`);
  }
}
