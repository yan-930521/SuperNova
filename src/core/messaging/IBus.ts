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
 * 代理協作事件命名空間 (AgentEvents)
 */
export namespace AgentEvents {
  export enum Supervisor {
    Dispatch = "SUPERVISOR_DISPATCH",
    Halt = "SUPERVISOR_HALT",
  }

  export enum Planning {
    Start = "PLANNING_START",
    Finish = "PLANNING_FINISH",
    Fail = "PLANNING_FAIL",
  }

  export enum Doing {
    Start = "DOING_START",
    Finish = "DOING_FINISH",
    Fail = "DOING_FAIL",
  }

  export enum Checking {
    Start = "CHECKING_START",
    Pass = "CHECKING_PASS",
    Fail = "CHECKING_FAIL",
  }

  export enum Acting {
    Start = "ACTING_START",
    Finish = "ACTING_FINISH",
    Fail = "ACTING_FAIL",
  }
}

/**
 * 型別別名定義
 */
export type SystemEventType = 
  | SystemEvents.Runtime 
  | SystemEvents.Session 
  | SystemEvents.Task;

export type AgentEventType = 
  | AgentEvents.Supervisor 
  | AgentEvents.Planning 
  | AgentEvents.Doing 
  | AgentEvents.Checking 
  | AgentEvents.Acting;

/**
 * 統一代理事件負載介面
 */
export interface IAgentEventPayload {
  readonly sessionId: string;
  readonly taskId?: string;
  readonly goal?: string;
  readonly content?: string;
  readonly error?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, any>;
}

/**
 * 代理專用事件型別 (已綁定統一 Payload)
 */
export type AgentEvent = IEvent<string, IAgentEventPayload>;

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
 * @template P 基礎負載型別約束
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
