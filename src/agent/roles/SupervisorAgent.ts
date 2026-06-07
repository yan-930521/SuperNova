import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { EventBus } from '../../core/messaging/MessageBus';
import { BaseAgent } from '../BaseAgent';

/**
 * SupervisorAgent (指揮官)
 * SuperNova 0.4.0 核心中樞
 * 職責: 持有 Swarm EventBus，負責全局分發與監控
 */
export class SupervisorAgent extends BaseAgent {
  protected setupSubscriptions(): void {
  }
}
