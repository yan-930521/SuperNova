import { DataBlock } from './DataBlock';

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
 * Agent 互動與廣播事件 (AgentEvent)
 */
export enum AgentEvent {
  AgentMessage = "AGENT_MESSAGE",
  AgentStateChanged = "AGENT_STATE_CHANGED"
}

/**
 * 彙整所有事件型別
 */
export type AllEventTypes = SystemEvent | HookEvent | AgentEvent;

/**
 * 全局事件註冊表 (EventMap)
 * 綁定每個事件名稱對應的 Payload 型別
 */
export interface GlobalEventMap {
  // --- System Events ---
  [SystemEvent.SessionStarted]: { sessionId: string };
  [SystemEvent.SessionClosed]: { sessionId: string };
  [SystemEvent.SessionUpdated]: { sessionId: string };
  [SystemEvent.TaskCreated]: { taskId: string };
  [SystemEvent.TaskFinished]: { taskId: string };
  [SystemEvent.TaskFailed]: { taskId: string; error: string };
  [SystemEvent.Tick]: { currentTime: number };

  // --- Hook Events ---
  [HookEvent.BeforeToolCall]: { toolName: string; args: any };
  [HookEvent.AfterToolCall]: { toolName: string; result: any };
  [HookEvent.OnToolError]: { toolName: string; error: string };
  [HookEvent.BeforeAgentStep]: { agentId: string };
  [HookEvent.AfterAgentStep]: { agentId: string };
  [HookEvent.OnAgentError]: { agentId: string; error: string };
  [HookEvent.BeforeTaskExecute]: { taskId: string };
  [HookEvent.AfterTaskExecute]: { taskId: string };
  [HookEvent.OnTaskError]: { taskId: string; error: string };

  // --- Agent Events ---
  [AgentEvent.AgentMessage]: DataBlock<any>;
  [AgentEvent.AgentStateChanged]: { agentId: string; oldState: string; newState: string };

  // --- 允許自定義擴充事件 ---
  [key: string]: any;
}

/**
 * 基礎事件介面 (自動推導 payload 型別)
 */
export interface IEvent<T extends Extract<keyof GlobalEventMap, string> = Extract<keyof GlobalEventMap, string>> {
  readonly type: T;
  readonly timestamp: number;
  readonly payload: GlobalEventMap[T];
  readonly sessionId?: string;
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
export interface IEventBus {
  /**
   * 發佈事件 (非同步廣播，不等待監聽器結束)
   */
  publish<T extends Extract<keyof GlobalEventMap, string>>(event: IEvent<T>): void;

  /**
   * 發佈事件並追蹤所有監聽器 (等待所有同步/異步 Handler 執行完畢)
   */
  publishAsync<T extends Extract<keyof GlobalEventMap, string>>(event: IEvent<T>): Promise<PromiseSettledResult<any>[]>;

  /**
   * 訂閱特定型別的事件 (回標函數訂閱)
   */
  subscribe<T extends Extract<keyof GlobalEventMap, string>>(
    type: T,
    handler: (event: IEvent<T>) => void | Promise<void>,
    options?: { sessionId?: string }
  ): void;

  /**
   * 訂閱所有型別的事件 (全域通配符型別安全)
   */
  subscribe(
    type: '*',
    handler: (event: IEvent<string>) => void | Promise<void>,
    options?: { sessionId?: string }
  ): void;

  /**
   * 宣告式訂閱 (用於 Agent 持久化休眠與喚醒)
   */
  subscribe<T extends Extract<keyof GlobalEventMap, string>>(
    type: T,
    subscriber: IDeclarativeSubscriber
  ): void;

  /**
   * 取消回標函數訂閱
   */
  unsubscribe<T extends Extract<keyof GlobalEventMap, string>>(
    type: T,
    handler: (event: IEvent<T>) => void | Promise<void>
  ): void;

  /**
   * 取消宣告式訂閱
   */
  unsubscribe<T extends Extract<keyof GlobalEventMap, string>>(
    type: T,
    subscriber: IDeclarativeSubscriber
  ): void;
}
