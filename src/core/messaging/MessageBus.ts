import { recorder } from '../../infra/LogManager';
import { 
  IEvent, 
  IEventBus
} from './IBus';

/**
 * 事件總線實作類
 * 負責非同步的事件廣播與訂閱管理
 * SuperNova 0.4.0 核心通訊組件
 */
export class EventBus implements IEventBus {
  private subscribers = new Map<string, Set<(event: any) => void>>();

  /**
   * 發佈事件至系統（非阻塞廣播）
   */
  publish<E extends IEvent>(event: E): void {
    const handlers = this.subscribers.get(event.type);
    if (!handlers || handlers.size === 0) return;

    // 使用 setImmediate 確保事件廣播不阻塞當前執行流
    setImmediate(() => {
      recorder.debug(`[EventBus] Publishing event: ${event.type} to ${handlers.size} subscribers`, { type: 'SYSTEM' });
      
      handlers.forEach(handler => {
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
   * @param type 事件型別
   * @param handler 訂閱處理函數
   */
  subscribe<T extends string, P = any>(
    type: T,
    handler: (event: IEvent<T, P>) => void
  ): void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    
    this.subscribers.get(type)!.add(handler);
    recorder.info(`[EventBus] Subscribed to: ${type}`, { type: 'SYSTEM' });
  }

  /**
   * 取消訂閱特定型別的事件
   * @param type 事件型別
   * @param handler 原註冊的處理函數引用
   */
  unsubscribe<T extends string, P = any>(
    type: T,
    handler: (event: IEvent<T, P>) => void
  ): void {
    const handlers = this.subscribers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(type);
      }
      recorder.info(`[EventBus] Unsubscribed from: ${type}`, { type: 'SYSTEM' });
    }
  }
}
