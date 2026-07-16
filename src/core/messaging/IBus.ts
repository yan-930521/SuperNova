/**
 * 系統級事件 (SystemEvent)
 * 用於描述系統核心組件的生命週期與關鍵狀態變化
 */
export enum SystemEvent {
  // Session 相關
  SessionStarted = "SESSION_STARTED",
  SessionClosed = "SESSION_CLOSED",
  SessionUpdated = "SESSION_UPDATED",

  // Task 全局狀態相關
  TaskCreated = "TASK_CREATED",
  TaskFinished = "TASK_FINISHED",
  TaskFailed = "TASK_FAILED",

  // 運行時
  Tick = "SYSTEM_TICK",
}

/**
 * 鉤子事件 (HookEvent)
 * 用於描述 Agent、Task、Tool 在執行生命週期中的切面監聽點
 */
export enum HookEvent {
  // Tool 執行切面
  BeforeToolCall = "BEFORE_TOOL_CALL",
  AfterToolCall = "AFTER_TOOL_CALL",
  OnToolError = "ON_TOOL_ERROR",

  // Agent 決策步驟切面
  BeforeAgentStep = "BEFORE_AGENT_STEP",
  AfterAgentStep = "AFTER_AGENT_STEP",
  OnAgentError = "ON_AGENT_ERROR",

  // Task 調度與執行切面
  BeforeTaskExecute = "BEFORE_TASK_EXECUTE",
  AfterTaskExecute = "AFTER_TASK_EXECUTE",
  OnTaskError = "ON_TASK_ERROR",
}

/**
 * 彙整所有事件型別
 */
export type AllEventTypes = SystemEvent | HookEvent;

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
