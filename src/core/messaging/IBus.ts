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
}

/**
 * 事件總線介面
 */
export interface IEventBus<P = any> {
  /**
   * 發佈事件
   */
  publish<T extends string, PL extends P>(event: IEvent<T, PL>): void;

  /**
   * 訂閱事件
   */
  subscribe<T extends string, PL extends P>(
    type: T,
    handler: (event: IEvent<T, PL>) => void
  ): void;

  /**
   * 取消訂閱
   */
  unsubscribe<T extends string, PL extends P>(
    type: T,
    handler: (event: IEvent<T, PL>) => void
  ): void;
}
