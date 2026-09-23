import { UsageStats } from '@core/agent';

/**
 * 定義注入 Prompt 區塊的標準排序位置 (1-10)
 * 數字越小，在最終 Prompt 中的位置越靠前（權重越高）
 */
export enum PromptSectionIndex {
    IDENTITY = 1,             // 角色定位與身分認知
    SYSTEM_CORE = 2,          // 系統層級的絕對核心設定
    MEMORY_CONTEXT = 3,       // 短期記憶與歷史上下文摘要 (圖譜)
    EPISODIC_MEMORY = 4,      // 每日總結與情節記憶
    ENVIRONMENT_STATE = 5,    // 當前環境與實體狀態 (World & Body)
    EMOTIONAL_STATE = 6,      // 內部情緒與動機模型 (OCC)
    TASK_DASHBOARD = 7,       // 全局任務看板 (DAG狀態)
    TACTICAL_GUIDELINE = 8,   // 領域戰術與行為準則 (左腦/右腦指南)
    TOOL_USAGE = 9,           // 工具使用規範與限制
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
    // 內核生命週期
    KernelBooting = "KERNEL_BOOTING",
    KernelBooted = "KERNEL_BOOTED",
    KernelStopping = "KERNEL_STOPPING",
    KernelStopped = "KERNEL_STOPPED",

    // 外掛與組件狀態監控
    PluginInstalled = "PLUGIN_INSTALLED",
    PluginInitialized = "PLUGIN_INITIALIZED",
    PluginStarted = "PLUGIN_STARTED",
    PluginStopped = "PLUGIN_STOPPED",
    ServiceRegistered = "SERVICE_REGISTERED",

    // 運行時心跳
    Tick = "SYSTEM_TICK",
}

/**
 * 會話訊息類型 (SessionMessageType)
 * 嚴格定義會話沙盒內所有角色發言之語意動態與來源分類
 */
export enum SessionMessageType {
    // 1. 人類互動層 (Human Layer)
    UserInput = "USER_INPUT",                 // 使用者一般指令或發話
    UserInterrupt = "USER_INTERRUPT",         // 使用者緊急中斷 / 糾偏指令 (優先度高)

    // 2. 代理決策層 (Agent Layer)
    AgentSend = "AGENT_SEND",                 // Agent 正式對外發言 / 回覆
    AgentThought = "AGENT_THOUGHT",           // Agent 內部思考 / 內在獨白
    CollaborationRequest = "COLLAB_REQUEST",  // Agent 向其他 Agent 提出協同或委派請求
    Handoff = "HANDOFF",                      // 會話控制權移交 (如 Main -> Worker)

    // 3. 環境與外部感知層 (Environment & Perception Layer)
    EnvironmentPerception = "ENV_PERCEPTION", // 外部世界狀態 (Minecraft、終端、檔案、感測器)
    SystemNotice = "SYSTEM_NOTICE",           // 系統動態通告 (儲存告警、時間到期、安全性提醒)

    // 4. 工具與沙盒執行層 (Execution Layer)
    ToolResult = "TOOL_RESULT",               // 工具呼叫成功之回傳
    ToolError = "TOOL_ERROR",                 // 工具執行異常之報告
}

/**
 * 會話協同事件 (SessionEvent)
 * 涵蓋人機對話、多 Agent 協同、環境感知與系統廣播通知之全局通訊場域
 */
export enum SessionEvent {
    /** 會話訊息流轉：人、Agent、系統、工具或環境發佈之通用通訊訊息 */
    SessionMessage = "SESSION_MESSAGE",
    SessionStarted = "SESSION_STARTED",
    SessionClosed = "SESSION_CLOSED",
    SessionUpdated = "SESSION_UPDATED",
    SessionOptimization = "SESSION_OPTIMIZATION",
}

/**
 * 會話訊息事件負載結構 (SessionMessagePayload)
 */
export interface SessionMessagePayload {
    /** 所屬會話唯一 ID */
    sessionId: string;
    /** 發送者 ID (如 'user', 'sys_admin', 'agent_worker_1', 'env_sensor') */
    senderId: string;
    /** 接收目標 ID。若為 null 或 '*' 則代表公頻廣播 */
    targetId?: string | null;
    /** 訊息來源角色分類：人類輸入、Agent產出、系統通告、工具執行結果 */
    type: SessionMessageType;
    /** 業務意圖標籤 (例如 'USER_COMMAND', 'TASK_RESULT', 'ENVIRONMENT_PERCEPTION') */
    intent?: string;
    /** 統一的 DataBlock 訊息陣列 (強制為陣列) */
    message: IDataBlock[];
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

    // Agent 決策執行週期切面
    BeforeAgentRun = "BEFORE_AGENT_RUN",
    AfterAgentRun = "AFTER_AGENT_RUN",
    OnAgentError = "ON_AGENT_ERROR",

    // Task 調度與執行切面
    BeforeTaskExecute = "BEFORE_TASK_EXECUTE",
    AfterTaskExecute = "AFTER_TASK_EXECUTE",
    OnTaskError = "ON_TASK_ERROR",
}

/**
 * Agent 狀態與切面事件 (AgentEvent)
 */
export enum AgentEvent {
    AgentStateChanged = "AGENT_STATE_CHANGED",
    WorldUpdated = "WORLD_UPDATED",
    EmotionTriggered = "EMOTION_TRIGGERED",
    ProjectionToggled = "PROJECTION_TOGGLED"
}

/**
 * 彙整所有事件型別
 */
export type AllEventTypes = SystemEvent | SessionEvent | HookEvent | AgentEvent;

/**
 * 全局事件註冊表 (EventMap)
 * 綁定每個事件名稱對應的 Payload 型別
 */
export interface GlobalEventMap {
    // --- System Events (微核心與外掛狀態) ---
    [SystemEvent.KernelBooting]: { timestamp: number };
    [SystemEvent.KernelBooted]: { timestamp: number };
    [SystemEvent.KernelStopping]: { timestamp: number };
    [SystemEvent.KernelStopped]: { timestamp: number };
    [SystemEvent.PluginInstalled]: { pluginName: string };
    [SystemEvent.PluginInitialized]: { pluginName: string };
    [SystemEvent.PluginStarted]: { pluginName: string };
    [SystemEvent.PluginStopped]: { pluginName: string };
    [SystemEvent.ServiceRegistered]: { serviceName: string };
    [SystemEvent.Tick]: { currentTime: number };

    // --- Session Events (統一會話通訊) ---
    [SessionEvent.SessionMessage]: SessionMessagePayload;
    [SessionEvent.SessionStarted]: { sessionId: string };
    [SessionEvent.SessionClosed]: { sessionId: string };
    [SessionEvent.SessionUpdated]: { sessionId: string };
    [SessionEvent.SessionOptimization]: { sessionId: string; targetDate: string };

    // --- Hook Events ---
    [HookEvent.BeforeToolCall]: { toolName: string; args: any };
    [HookEvent.AfterToolCall]: { toolName: string; args: any; result: any };
    [HookEvent.OnToolError]: { toolName: string; args: any; error: string };
    [HookEvent.BeforeAgentRun]: { agentId: string };
    [HookEvent.AfterAgentRun]: { agentId: string };
    [HookEvent.OnAgentError]: { agentId: string; error: string };
    [HookEvent.BeforeTaskExecute]: { taskId: string };
    [HookEvent.AfterTaskExecute]: { taskId: string };
    [HookEvent.OnTaskError]: { taskId: string; error: string };

    // --- Agent Events ---
    [AgentEvent.AgentStateChanged]: { agentId: string; oldState: string; newState: string };
    [AgentEvent.WorldUpdated]: { agentId: string; worldState: string };
    [AgentEvent.EmotionTriggered]: { impacts: any };
    [AgentEvent.ProjectionToggled]: { targetAgentId: string; controllerId: string; enable: boolean };

    // --- 允許自定義擴充事件 ---
    [key: string]: any;
}

/**
 * 系統通用資料載體基礎抽象介面
 */
export interface IDataBlock {
    readonly id: string;
    readonly sessionId: string;
    readonly threadId?: string | null;
    readonly senderId: string;
    readonly targetId?: string | null;
    readonly type: string;
    readonly intent: string;
    readonly priority: number;
    readonly timestamp: number;
    readonly controlPayload: any;
    readonly dataPointers?: any[];
    readonly metadata?: Record<string, any>;
    toMarkdown?(): string;
    toMessage?(readerId?: string): any;
    toJSON?(): any;
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
