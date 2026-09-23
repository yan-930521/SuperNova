import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { ILLMProvider } from '@supernova/common/llm';
import { IEventBus, IPromptSection } from '@supernova/events/IBus';

import { ILifecycle } from '../';
import { IConfigManager } from '../../../packages/common/src/config';

/**
 * Agent 執行期狀態機
 */
export enum AgentState {
    INITIALIZING = 'INITIALIZING',
    IDLE = 'IDLE',
    BUSY = 'BUSY',
    SUSPENDED = 'SUSPENDED',
    STOPPED = 'STOPPED',
}

/**
 * 提供給模組 (Module) 的 Agent 上下文能力子集
 * 遵循最小權限原則，器官只能存取標準介面，不直接依賴 UniversalAgent 實體
 */
export interface IAgentContext {
    /** Agent 唯一識別 ID */
    readonly agentId: string;

    /** 所屬會話 ID (若有) */
    readonly sessionId?: string;

    /** 全域事件匯流排 */
    readonly eventBus: IEventBus;

    /** LLM 提供者服務 */
    readonly llmProvider: ILLMProvider;

    /** 全域配置管理器 (可選) */
    readonly config?: IConfigManager;

    /**
     * 查詢是否有特定名稱的模組掛載
     */
    hasModule(name: string): boolean;

    /**
     * 獲取特定的模組實例
     */
    getModule<T extends IAgentModule>(name: string): T | undefined;

    /**
     * 動態設定或切換 Agent 推論使用的 LLM Preset 名稱
     */
    setPresetName?(presetName: string): void;
}

/**
 * 單次執行週期的上下文 (RunContext)
 * 貫穿 onBeforeRun -> LLM & ReactAgent Invoke -> onAfterRun
 */
export interface RunContext {
    /** Agent 唯一 ID */
    readonly agentId: string;

    /** 傳入與累積的對話訊息列表 */
    messages: BaseMessage[];

    /** 本次執行收集到的所有可用工具清單 */
    tools: any[];

    /** 各模組注入的 Prompt 區塊清單 (按 index 升冪排列) */
    promptSections: IPromptSection[];

    /** LLM 模型返回的最終 AIMessage (含文字與 tool_calls) */
    modelResponse?: AIMessage;

    /** 最終輸出結果 */
    output?: any;

    /** 供各模組跨執行週期存放臨時資訊的字典 (例如 newBlocks, usageDelta) */
    metadata: Record<string, any>;
}

/**
 * Agent 組合式模組規格 (IAgentModule)
 * 一切皆模組：歷史、記憶、情緒、規劃、環境皆為 Agent 的插拔器官
 */
export interface IAgentModule {
    /** 模組唯一識別名稱 */
    readonly name: string;

    /** 優先級 (數字越小越先執行鉤子，預設 50) */
    readonly priority: number;

    /** 依賴的必要前置模組清單 */
    readonly requires?: string[];

    /** 互斥的模組清單 (若存在則禁止掛載) */
    readonly conflicts?: string[];

    /**
     * 當模組掛載到 Agent 時觸發
     */
    onAttach(context: IAgentContext): Promise<void> | void;

    /**
     * 當模組從 Agent 卸載時觸發
     */
    onDetach(): Promise<void> | void;

    /**
     * 在 Agent 執行推論與工具決策前觸發 (可修改 Prompt、注入臨時訊息或動態裝配上下文)
     */
    onBeforeRun?(context: RunContext): Promise<void> | void;

    /**
     * 在 LLM 與工具執行後觸發 (可解析輸出、固化對話記憶、更新內部情緒狀態)
     */
    onAfterRun?(context: RunContext): Promise<void> | void;

    /**
     * 模組動態提供的 Prompt 段落 (會依 PromptSectionIndex 排序後組裝為 SystemMessage)
     */
    getPromptSections?(): IPromptSection[] | Promise<IPromptSection[]>;

    /**
     * 模組動態提供的工具清單
     */
    getTools?(): any[] | Promise<any[]>;
}

/**
 * 資源與 Token 消耗統計介面
 */
export interface UsageStats {
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
}

/**
 * 核心 Agent 介面
 */
export interface IAgent extends ILifecycle {
    /** Agent 識別 ID */
    readonly id: string;

    /** 當前運行狀態 */
    readonly state: AgentState;

    /** 所使用的 LLM Preset 名稱 */
    presetName: string;

    /** 累積資源消耗統計 */
    readonly usageStats?: UsageStats;

    /**
     * 動態設定或切換 Agent 推論使用的 LLM Preset 名稱
     */
    setPresetName(presetName: string): void;

    /**
     * 掛載模組 (器官)
     */
    attachModule(module: IAgentModule): Promise<this>;

    /**
     * 卸載模組
     */
    detachModule(moduleName: string): Promise<boolean>;

    /**
     * 取得已掛載的模組
     */
    getModule<T extends IAgentModule>(name: string): T | undefined;

    /**
     * 檢查是否掛載某模組
     */
    hasModule(name: string): boolean;

    /**
     * 執行完整對話與推論決策週期
     * @param input 使用者輸入或對話訊息列表
     */
    run(input: string | BaseMessage[]): Promise<AIMessage>;
}
