import { recorder } from '../../infra/LogManager';
import { 
  IEvent, 
  IEventBus
} from './IBus';

/**
 * 事件總線實作類
 * 負責非同步的事件廣播與訂閱管理
 * @template P 基礎負載型別約束
 */
export class EventBus<P = any> implements IEventBus<P> {
  private subscribers = new Map<string, Set<(event: IEvent<any, any>) => void>>();

  /**
   * 發佈事件至系統
   */
  publish<T extends string, PL extends P>(event: IEvent<T, PL>): void {
    const specificHandlers = this.subscribers.get(event.type) || new Set();
    const wildcardHandlers = this.subscribers.get('*') || new Set();
    
    const allHandlers = new Set([...specificHandlers, ...wildcardHandlers]);
    if (allHandlers.size === 0) return;

    setImmediate(() => {
      recorder.debug(`[EventBus] Publishing event: ${event.type} to ${allHandlers.size} subscribers`, { type: 'SYSTEM' });
      
      allHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          recorder.error(`[EventBus] Subscriber failed for event: ${event.type}`, {
            type: 'SYSTEM',
            payload: { error: error instanceof Error ? error.message : String(error) }
          });
        }
      });
    });
  }

  /**
   * 訂閱特定型別的事件
   */
  subscribe<T extends string, PL extends P>(
    type: T,
    handler: (event: IEvent<T, PL>) => void
  ): void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    
    this.subscribers.get(type)!.add(handler as any);
    recorder.info(`[EventBus] Subscribed to: ${type}`, { type: 'SYSTEM' });
  }

  /**
   * 取消訂閱特定型別的事件
   */
  unsubscribe<T extends string, PL extends P>(
    type: T,
    handler: (event: IEvent<T, PL>) => void
  ): void {
    const handlers = this.subscribers.get(type);
    if (handlers) {
      handlers.delete(handler as any);
      if (handlers.size === 0) {
        this.subscribers.delete(type);
      }
      recorder.info(`[EventBus] Unsubscribed from: ${type}`, { type: 'SYSTEM' });
    }
  }
}
