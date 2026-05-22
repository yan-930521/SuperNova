import type { Event } from '../models/Event';
import { logger } from './LogManager';

/**
 * 事件總線
 * 負責系統內部的事件發布與訂閱。
 * 使用 Map 與 Set 進行高效的事件分發。
 */
export class EventBus {
  private static instance: EventBus;
  private handlers: Map<string, Set<(event: Event) => void>> = new Map();

  private constructor() {}

  /**
   * 獲取 EventBus 單例
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * 發布事件
   * 將事件分發給所有對該類型感興趣的訂閱者。
   * @param event 符合 Event 結構的事件對象
   */
  publish(event: Event): void {
    logger.info(`[EventBus] Publishing event: ${event.type}`, { type: 'SYSTEM' });
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          logger.error(`[EventBus] Error in handler for ${event.type}:`, { type: 'SYSTEM', payload: { error } });
        }
      });
    }
  }

  /**
   * 訂閱事件
   * 註冊一個處理函數，當指定類期的事件發生時被調用。
   * @param type 事件類型字串 (精確匹配)
   * @param handler 處理函數 (接收 Event 作為參數)
   */
  subscribe(type: string, handler: (event: Event) => void): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  /**
   * 取消訂閱
   * 移除已註冊的處理函數。
   * @param type 事件類型字串
   * @param handler 原註冊的處理函數引用
   */
  unsubscribe(type: string, handler: (event: Event) => void): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
      if (typeHandlers.size === 0) {
        this.handlers.delete(type);
      }
    }
  }
}
