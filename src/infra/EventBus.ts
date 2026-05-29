import { recorder } from './LogManager';
import { IEventBus, ISystemEvent, SystemEventType } from './types/events';

/**
 * 事件總線 (EventBus)
 * 負責系統內部的強型別事件發布與訂閱。
 * 實現 IEventBus 介面，支持模塊化替換。
 */
export class EventBus implements IEventBus {
  /** 處理函數映射表：使用 Map 與 Set 進行高效的事件分發 */
  private handlers: Map<SystemEventType, Set<(event: ISystemEvent) => void>> = new Map();

  constructor() { }

  /**
   * 發布事件
   * 將事件分發給所有對該類型感興趣的訂閱者。
   * @param event 符合 ISystemEvent 結構的事件對象
   */
  publish<T = any>(event: ISystemEvent<T>): void {
    recorder.info(`[EventBus] Publishing event: ${event.type}`, {
      type: 'SYSTEM',
      session_id: event.sessionId,
      payload: { eventType: event.type }
    });

    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          recorder.error(`[EventBus] Error in handler for ${event.type}:`, {
            type: 'SYSTEM',
            payload: { error, event }
          });
        }
      });
    }
  }

  /**
   * 訂閱事件
   * 註冊一個處理函數，當指定類型的事件發生時被調用。
   * @param type 系統事件類型 (Enum)
   * @param handler 處理函數 (接收 ISystemEvent 作為參數)
   */
  subscribe<T = any>(type: SystemEventType, handler: (event: ISystemEvent<T>) => void): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  /**
   * 取消訂閱
   * 移除已註冊的處理函數。
   * @param type 系統事件類型
   * @param handler 原註冊的處理函數引用
   */
  unsubscribe<T = any>(type: SystemEventType, handler: (event: ISystemEvent<T>) => void): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
      if (typeHandlers.size === 0) {
        this.handlers.delete(type);
      }
    }
  }
}
