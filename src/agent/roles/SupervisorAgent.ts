import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { BaseAgent } from '../BaseAgent';

/**
 * SupervisorAgent (指揮官)
 * SuperNova 0.4.0 核心中樞
 * 職責: 持有 Swarm EventBus，負責全局分發與監控
 */
export class SupervisorAgent extends BaseAgent {
  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
  }

  protected setupSubscriptions(): void {
    // 監聽全局分派指令
    this.bus.subscribe(AgentEvents.Supervisor.Dispatch, this.onDispatch.bind(this));
  }

  /**
   * 處理全局分派：初始化任務鏈追蹤並啟動規劃
   */
  private onDispatch(event: AgentEvent): void {
    const { sessionId, goal } = event.payload;
    
    // 1. 生成或繼承 TraceID (確保整個任務鏈可追蹤)
    const traceId = event.payload.traceId || crypto.randomUUID();

    this.log(`[Supervisor] New goal received: ${goal}`, 'info', { 
      traceId, 
      sessionId 
    });

    // 2. 啟動 Planning 階段
    this.bus.publish({
      type: AgentEvents.Planning.Start,
      timestamp: Date.now(),
      payload: {
        sessionId,
        traceId,
        goal,
        spanId: crypto.randomUUID(),
        parentSpanId: event.payload.spanId
      }
    });
  }
}
