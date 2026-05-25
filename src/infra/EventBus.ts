import { IEventBus, ISystemEvent, SystemEventType } from './types/events';
import { recorder } from './LogManager';

/**
 * 事件總線 (EventBus)
 * 負責系統內部的強型別事件發布與訂閱。
 * 實現 IEventBus 介面，支持模塊化替換。
 */
export class EventBus implements IEventBus {
  /** 處理函數映射表：使用 Map 與 Set 進行高效的事件分發 */
  private handlers: Map<SystemEventType, Set<(event: ISystemEvent) => void>> = new Map();

  constructor() {}

  /**
   * 發布事件
   * 將事件分發給所有對該類型感興趣的訂閱者。
   * @param event 符合 ISystemEvent 結構的事件對象
   */
  publish(event: ISystemEvent): void {
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
  subscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void {
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
  unsubscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
      if (typeHandlers.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  /**
   * 舊版相容性發布方法 (可選)
   * 允許發布非強型別事件 (內部轉換為 TASK_FAILED 或其他合適類型)
   */
  publishLegacy(type: string, payload: any, sessionId: string = 'unknown'): void {
    // 這裡可以根據需要進行映射
    this.publish({
      type: SystemEventType.TASK_FAILED, // 預設映射或根據 type 判斷
      userId: 'system',
      sessionId,
      payload,
      timestamp: Date.now()
    });
  }
}
