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

  /** 任務流轉狀態機事件 */
  export enum Flow {
    Initialize = "FLOW_INITIALIZE", // 初始化 TaskFlow
    Transition = "FLOW_TRANSITION", // 狀態遷徙觸發
    Escalate = "FLOW_ESCALATE",     // 異常上報/換檔
  }
}

/**
 * 彙整所有事件型別
 */
export type AllEventTypes = 
  SystemEvents.Runtime | 
  SystemEvents.Session | 
  SystemEvents.Task | 
  AgentEvents.Supervisor | 
  AgentEvents.Planning | 
  AgentEvents.Doing | 
  AgentEvents.Checking | 
  AgentEvents.Acting | 
  AgentEvents.Flow;

/**
 * 統一代理事件負載介面
 */
export interface IAgentEventPayload {
  readonly sessionId: string;
  readonly traceId: string;       // 追蹤整個任務鏈
  readonly spanId: string;        // 識別當前執行片段 (必填)
  readonly parentSpanId?: string; // 用於父子關係
  readonly templateType?: string; // 初始路由指定的模板
  readonly currentPhase?: string; // 當前 PDCA 階段
  readonly taskId?: string;
  readonly goal?: string;
  readonly content?: string;
  readonly error?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, any>;
}

/**
 * 代理執行工具時的上下文介面
 */
export interface IAgentExecuteContext {
  sessionId: string;
  traceId: string;
  agentId: string;
  metadata?: Record<string, any>;
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
