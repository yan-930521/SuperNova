import type { Event } from '../../src/models/Event';

/**
 * 事件總線接口
 * 負責系統內部的事件發布與訂閱。
 */
export interface IEventBus {
  /**
   * 發布事件
   * 將事件分發給所有對該類型感興趣的訂閱者。
   * @param event 符合 Event 結構的事件對象
   */
  publish(event: Event): void;

  /**
   * 訂閱事件
   * 註冊一個處理函數，當指定類期的事件發生時被調用。
   * @param type 事件類型字串 (精確匹配)
   * @param handler 處理函數 (接收 Event 作為參數)
   */
  subscribe(type: string, handler: (event: Event) => void): void;

  /**
   * 取消訂閱
   * 移除已註冊的處理函數。
   * @param type 事件類型字串
   * @param handler 原註冊的處理函數引用
   */
  unsubscribe(type: string, handler: (event: Event) => void): void;
}
