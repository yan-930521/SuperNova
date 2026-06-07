import { AgentEvent, AgentEvents } from '../../core/messaging/IBus';
import { BaseAgent } from '../BaseAgent';

/**
 * DoingAgent (行動者)
 */
export class DoingAgent extends BaseAgent {
  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Doing.Start, this.onDoingStart.bind(this));
  }

  private async onDoingStart(event: AgentEvent): Promise<void> {
    this.log(`[DoingAgent] started task: ${event.payload.taskId}`);
  }
}
