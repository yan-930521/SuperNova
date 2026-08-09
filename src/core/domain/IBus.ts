import { ContextOverride } from '../agent/BaseAgent';
import { DataBlock } from '../messaging/DataBlock';

/**
 * 定義注入 Prompt 區塊的標準排序位置 (1-10)
 * 數字越小，在最終 Prompt 中的位置越靠前（權重越高）
 */
export enum PromptSectionIndex {
    IDENTITY = 1,             // 角色定位與身分認知
    SYSTEM_CORE = 2,          // 系統層級的絕對核心設定
    TACTICAL_GUIDELINE = 3,   // 領域戰術與行為準則 (左腦/右腦指南)
    ENVIRONMENT_STATE = 4,    // 當前環境與實體狀態 (World & Body)
    EMOTIONAL_STATE = 5,      // 內部情緒與動機模型 (OCC)
    TOOL_USAGE = 6,           // 工具使用規範與限制
    MEMORY_CONTEXT = 7,       // 短期記憶與歷史上下文摘要
    TASK_DASHBOARD = 8,       // 全局任務看板 (DAG狀態)
}

/**
 * 用於 HookEvent 注入 Prompt 的結構
 * index: 決定該段落在最終 Prompt 中的排序 (越小越前面)
 */
export interface IPromptSection {
    index: PromptSectionIndex | number;
    content: string;
}

/**
 * 系統級事件 (SystemEvent)
 * 用於描述系統核心組件的生命週期與關鍵狀態變化
 */
export enum SystemEvent {
    // Session 相關
    SessionStarted = "SESSION_STARTED",
    SessionClosed = "SESSION_CLOSED",
    SessionUpdated = "SESSION_UPDATED",
    SessionOptimization = "SESSION_OPTIMIZATION",

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
    AgentStateChanged = "AGENT_STATE_CHANGED",
    WorldUpdated = "WORLD_UPDATED",
    EmotionTriggered = "EMOTION_TRIGGERED",
    ProjectionToggled = "PROJECTION_TOGGLED"
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
    [SystemEvent.SessionOptimization]: { sessionId: string; targetDate: string };
    [SystemEvent.TaskCreated]: { taskId: string };
    [SystemEvent.TaskFinished]: { taskId: string; result?: string };
    [SystemEvent.TaskFailed]: { taskId: string; error: string };
    [SystemEvent.Tick]: { currentTime: number };

    // --- Hook Events ---
    [HookEvent.BeforeToolCall]: { toolName: string; args: any };
    [HookEvent.AfterToolCall]: { toolName: string; result: any };
    [HookEvent.OnToolError]: { toolName: string; error: string };
    [HookEvent.BeforeAgentStep]: ContextOverride;
    [HookEvent.AfterAgentStep]: { agentId: string };
    [HookEvent.OnAgentError]: { agentId: string; error: string };
    [HookEvent.BeforeTaskExecute]: { taskId: string };
    [HookEvent.AfterTaskExecute]: { taskId: string };
    [HookEvent.OnTaskError]: { taskId: string; error: string };

    // --- Agent Events ---
    [AgentEvent.AgentMessage]: DataBlock<any> | DataBlock<any>[];
    [AgentEvent.AgentStateChanged]: { agentId: string; oldState: string; newState: string };
    [AgentEvent.WorldUpdated]: { agentId: string; worldState: string };
    [AgentEvent.EmotionTriggered]: { impacts: any };
    [AgentEvent.ProjectionToggled]: { targetAgentId: string; controllerId: string; enable: boolean };

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
     * 取消回標函數訂閱
     */
    unsubscribe<T extends Extract<keyof GlobalEventMap, string>>(
        type: T,
        handler: (event: IEvent<T>) => void | Promise<void>
    ): void;

}
