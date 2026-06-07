import { IAgentEventPayload, IEventBus } from '../core/messaging/IBus';
import { recorder } from '../infra/LogManager';
import { GlobalRuntime } from '../runtime/GlobalRuntime';

/**
 * BaseAgent (代理基類) - SuperNova 0.4.0
 * 
 * 所有專業角色 Agent 的抽象基類。
 * 核心特性：
 * 1. 唯一注入 (Single Injection): 僅透過構造函數注入 Agent 專用 EventBus。
 * 2. 服務訪問 (Service Access): 透過 GlobalRuntime 單例存取其他系統級服務。
 */
export abstract class BaseAgent {
  protected readonly runtime = GlobalRuntime.getInstance();

  constructor(
    public readonly id: string,
    protected readonly bus: IEventBus<IAgentEventPayload>
  ) {
    this.setupSubscriptions();
    recorder.info(`[BaseAgent] Agent [${this.id}] initialized.`, { 
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
