import { MemoryService } from '../application/memory/MemoryService';
import { IAgentEventPayload, IEventBus } from '../core/messaging/IBus';
import { recorder } from '../infra/LogManager';

/**
 * BaseAgent (代理基類) - SuperNova 0.4.0
 * 
 * 所有專業角色 Agent 的抽象基類。
 * 核心特性：
 * 1. 事件驅動 (Event-Driven): 透過注入的 IEventBus 進行通訊。
 * 2. 外部黑板 (Blackboard): 透過 BlackboardService.for(sessionId) 動態存取狀態。
 */
export abstract class BaseAgent {
  constructor(
    public readonly id: string,
    protected readonly bus: IEventBus<IAgentEventPayload>
  ) {
    this.setupSubscriptions();
    recorder.info(`[BaseAgent] Agent [${this.id}] initialized and listening for events.`, { 
      type: 'SYSTEM',
      agent_id: this.id 
    });
  }

  /**
   * 子類必須實作，定義其監聽的事件
   */
  protected abstract setupSubscriptions(): void;

  /**
   * 通用的狀態與日誌紀錄工具
   */
  protected log(msg: string, level: 'info' | 'error' | 'debug' = 'info', context?: Partial<IAgentEventPayload>): void {
    const formattedMsg = `[Agent:${this.id}] ${msg}`;
    const logContext = {
      type: 'AGENT',
      agent_id: this.id,
      trace_id: context?.traceId,
      session_id: context?.sessionId,
      ...context?.metadata
    };
    
    if (level === 'error') {
      recorder.error(formattedMsg, logContext);
    } else if (level === 'debug') {
      recorder.debug(formattedMsg, logContext);
    } else {
      recorder.info(formattedMsg, logContext);
    }
  }
}
