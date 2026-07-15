/**
 * 系統級事件命名空間 (SystemEvents)
 */
export namespace SystemEvents {
  export enum Runtime {
    Tick = "SYSTEM_TICK",
  }

  export enum Session {
    Started = "SESSION_STARTED",
    Closed = "SESSION_CLOSED",
    Updated = "SESSION_UPDATED",
  }

  export enum Task {
    Created = "TASK_CREATED",
    Finished = "TASK_FINISHED",
    Failed = "TASK_FAILED",
  }
}

/**
 * 彙整所有事件型別
 */
export type AllEventTypes =
  | SystemEvents.Runtime
  | SystemEvents.Session
  | SystemEvents.Task;

/**
 * 基礎事件介面
 * @template T 事件型別
 * @template P 事件負載 (Payload)
 */
export interface IEvent<T extends string = string, P = any> {
  readonly type: T;
  readonly timestamp: number;
  readonly payload: P;
  readonly sessionId?: string; // 新增：可選的會話 ID，用於多會話安全隔離
}

/**
 * 宣告式訂閱者資訊，用於持久化與 EventBus 喚醒連動
 */
export interface IDeclarativeSubscriber {
  readonly sessionId: string;
  readonly agentId: string;
}

/**
 * 事件總線介面
 */
export interface IEventBus<P = any> {
  /**
   * 發佈事件 (非同步廣播，不等待監聽器結束)
   */
  publish<T extends string, PL extends P>(event: IEvent<T, PL>): void;

  /**
   * 發佈事件並追蹤所有監聽器 (等待所有同步/異步 Handler 執行完畢)
   */
  publishAsync<T extends string, PL extends P>(event: IEvent<T, PL>): Promise<PromiseSettledResult<any>[]>;

  /**
   * 訂閱特定型別的事件 (回標函數訂閱)
   */
  subscribe<T extends string, PL extends P>(
    type: T,
    handler: (event: IEvent<T, PL>) => void,
    options?: { sessionId?: string }
  ): void;

  /**
   * 訂閱所有型別的事件 (全域通配符型別安全)
   */
  subscribe(
    type: '*',
    handler: (event: IEvent<string, any>) => void,
    options?: { sessionId?: string }
  ): void;

  /**
   * 宣告式訂閱 (用於 Agent 持久化休眠與喚醒)
   */
  subscribe(
    type: string,
    subscriber: IDeclarativeSubscriber
  ): void;

  /**
   * 取消回標函數訂閱
   */
  unsubscribe<T extends string, PL extends P>(
    type: T,
    handler: (event: IEvent<T, PL>) => void
  ): void;

  /**
   * 取消宣告式訂閱
   */
  unsubscribe(
    type: string,
    subscriber: IDeclarativeSubscriber
  ): void;
}
