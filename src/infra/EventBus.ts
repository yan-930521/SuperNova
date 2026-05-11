import { IEventBus } from '../../interfaces/infra/IEventBus';
import { IEvent } from '../../interfaces/models/IEvent';

/**
 * 事件總線實作
 * 使用 Map 與 Set 進行高效的事件分發。
 */
export class EventBus implements IEventBus {
  private handlers: Map<string, Set<(event: IEvent) => void>> = new Map();

  /**
   * 發布事件
   */
  publish(event: IEvent): void {
    console.log(`[EventBus] Publishing event: ${event.type}`);
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[EventBus] Error in handler for ${event.type}:`, error);
        }
      });
    }
  }

  /**
   * 訂閱事件
   */
  subscribe(type: string, handler: (event: IEvent) => void): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  /**
   * 取消訂閱
   */
  unsubscribe(type: string, handler: (event: IEvent) => void): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
      if (typeHandlers.size === 0) {
        this.handlers.delete(type);
      }
    }
  }
}
