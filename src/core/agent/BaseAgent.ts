import { createAgent, ReactAgent } from 'langchain';
import * as path from 'path';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';

import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { IDataBlockRepository, IEntity } from '../infra/persistence/IRepository';
import { WorkspaceType } from '../infra/persistence/IWorkspaceManager';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { DataBlock, MessagePriority } from '../messaging/DataBlock';
import {
    AgentEvent, HookEvent, IEventBus, IPromptSection, PromptSectionIndex
} from '../messaging/IBus';
import { BaseTool } from './tool/BaseTool';

/** 代理人內部狀態與情緒載體 */
export interface EmotionalState {
    // 基礎資源
    energy: number;       // 能量值 (0-100)，隨時間或運算消耗
    intimacy: number;     // 親密度/好感度 (Affinity) (0-100)

    // 具體情緒維度 (0-100)
    joy: number;          // 喜悅
    distress: number;     // 難過/痛苦
    anxiety: number;      // 焦慮
    fear: number;         // 恐懼
    pride: number;        // 驕傲/成就感
    stress: number;       // 壓力
    excitement: number;   // 興奮
    socialNeed: number;   // 社交需求/孤單感
}

/**
 * 代理人結構化身份與認知設定檔 (Cognitive Architecture Profile)
 * (僅保留靜態核心設定，動態狀態與任務資訊未來將由 Context/State 接管)
 */
export interface AgentProfile {
    /** Agent 的基本身分描述 */
    identity?: string;
    /** 核心任務目標 */
    mission?: string;
    /** 行事準則與底線 */
    principles?: string[];
    /** 具備的能力說明 */
    capabilities?: string[];
    /** 特殊的行動綱領 */
    action_guidelines?: string[];
    /** 輸出格式要求 */
    outputFormat?: string;
    /** 預設使用的 LLM preset */
    llmPreset?: string;
}

/**
 * 執行管線上下文覆寫設定 (Context Override)
 * 供 ProjectionHandler 或外部系統在單次 processInbox 執行時，
 * 強制替換 Agent 的人設、工具、環境狀態與歷史紀錄。
 */
export interface ContextOverride {
    /** 要讀取/掛載歷史記憶的目標 Agent ID (預設為自己的 ID) */
    agentId?: string;
    /** 替換的人設 (例如：大腦的 Profile) */
    profile?: AgentProfile;
    /** 替換的可用工具集 (例如：大腦的工具 + 軀殼的工具) */
    tools?: BaseTool[];
    /** 直接注入完整的歷史紀錄陣列 (若提供此值，將完全跳過內部 DB 查詢，大幅提升快取效能) */
    fullHistory?: DataBlock[];
    /** 額外附加的歷史紀錄 (會與撈取到的歷史進行時間戳排序合併) */
    additionalHistory?: DataBlock[];
    /** 強制替換的環境感官狀態 (例如：套用軀殼的感官) */
    envState?: string;
    /** 動態注入的系統 Prompt 區段 */
    injectedPrompts?: IPromptSection[];
}

/**
 * 代理人型別枚舉
 */
export enum AgentType {
    MAIN = 'MAIN',
    TASK = 'TASK',
    EMBODIED = 'EMBODIED'
}

/**
 * 代理人狀態實體數據結構 (DTO)
 */
export interface BaseAgentData extends IEntity {
    readonly id: string;
    readonly sessionId: string;
    readonly type: AgentType;
    readonly canClone: boolean;
    readonly state: string;           // AgentState enum 的字串表示
    readonly usageStats: {
        promptTokens: number;
        completionTokens: number;
        durationMs: number;
    };
    readonly timestamp: number;
    readonly remoteControllerId?: string | null;
    readonly projectedBodyId?: string | null;
    readonly projectionStartTime?: number;
    readonly profile?: AgentProfile;
    readonly emotionalState?: EmotionalState;
    readonly workspaceType?: WorkspaceType;
}

/**
 * Agent 的純粹生命週期狀態
 */
export enum AgentState {
    /** 建構與綁定基礎設施中 */
    INITIALIZING = 'INITIALIZING',
    /** 就緒並等待事件 */
    IDLE = 'IDLE',
    /** 正在處理業務邏輯 (子類別負責定義自己在忙什麼) */
    BUSY = 'BUSY',
    /** 掛起中，主動釋放資源 */
    SUSPENDED = 'SUSPENDED',
    /** 意識投影中 (靈魂不在體內，不處理自身 Inbox) */
    PROJECTING = 'PROJECTING',
    /** 已安全銷毀 */
    TERMINATED = 'TERMINATED'
}

/**
 * 資源消耗統計介面
 */
export interface UsageStats {
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
}

/**
 * Agent 建構選項
 */
export interface AgentOptions {
    workspacePath?: string;
    workspaceType?: WorkspaceType;
    agentManager?: any; // 注入 AgentManager 供動態存取
}

/**
 * 所有 Agent 的抽象基底類別 (BaseAgent)
 * 整合了 Session 綁定、上下文綁定日誌 (Contextual Logger)、資源計量、狀態持久化、事件驅動與 LangChain。
 */
export abstract class BaseAgent {
    public abstract readonly type: AgentType;
    public abstract readonly canClone: boolean;

    /** 當前生命週期狀態 */
    protected state: AgentState;
    public get status(): AgentState {
        return this.state;
    }
    /** 上下文綁定的專屬 Logger (不會污染全局) */
    protected readonly logger: LogManager;

    /** 結構化身份設定 */
    protected profile?: AgentProfile;

    /** 動態內部情感與狀態 (OCC 情緒模型) */
    protected emotionalState?: EmotionalState;

    /** 物理世界感官狀態快取 (來自 WorldUpdated 事件) */
    protected envState: string = '';
    public getEnvState(): string { return this.envState; }


    /** 資源消耗累積統計 */
    protected usageStats: UsageStats = { promptTokens: 0, completionTokens: 0, durationMs: 0 };
    protected activeExecutions: number = 0;
    public projectionHandler: any = null;

    /** 物理工作空間的絕對路徑 */
    public readonly workspacePath: string;
    public readonly workspaceType: WorkspaceType;
    protected readonly oplogDir: string;
    protected readonly stateFilePath: string; // 為了與原先代碼相容保留

    protected readonly agentManager?: any;

    private llmInstances = new Map<string, BaseChatModel>();

    /** 裝備的工具清單 */
    protected tools: BaseTool[] = [];
    private reactAgentCache = new Map<string, ReactAgent>();
    private cachedToolsSignature: string = '';

    constructor(
        public readonly id: string,
        public readonly sessionId: string, // 強制綁定會話 ID，所有衍生 Agent/Worker 均依附於此會話
        protected readonly eventBus: IEventBus,
        protected readonly config: Config,
        protected readonly dataBlockRepo: IDataBlockRepository,
        options?: AgentOptions
    ) {
        this.state = AgentState.INITIALIZING;

        // 注入專屬的 Contextual Logger，追蹤這個 Agent 的所有行為
        this.logger = new LogManager({ agent_id: this.id, session_id: this.sessionId, type: 'AGENT' });
        // 安裝 Console 傳輸器，並使用 [Agent:<id>] 作為前綴標籤，以避免日誌調用時重複添加前綴
        this.logger.addTransport(new ConsoleTransport('DEBUG', `[Agent:${this.id}]`));

        // 物理工作空間路徑指派
        this.workspacePath = options?.workspacePath || '';
        this.workspaceType = options?.workspaceType || 'PERSISTENT';
        this.agentManager = options?.agentManager;
            this.oplogDir = path.join(
                process.cwd(),
                this.config.storage.base_dir,
                this.config.storage.session_dir,
                this.sessionId,
                this.config.storage.agent_dir,
                this.id
            );
            this.stateFilePath = path.join(this.oplogDir, 'state.json');
        

        this.logger.addTransport(new FileTransport('DEBUG', this.oplogDir, this.config.storage.oplog_file));
        this.logger.info(`Initializing agent: ${this.id} under session: ${this.sessionId}`);

        // 統一呼叫 Hook 註冊，確保所有繼承的 Agent 都在基礎建設就緒後掛載監聽器
        this.setupHooks();
    }

    /**
     * 註冊 Agent 專屬的 Hooks
     * 預設為空，供子類別 Override 來實作各自的事件監聽邏輯
     */
    protected setupHooks(): void {
        this.eventBus.subscribe(AgentEvent.WorldUpdated, (event) => {
            if (event.payload.agentId === this.id) {
                this.envState = event.payload.worldState;
            }
        });

    }

    // ==========================================
    // 資源消耗追蹤
    // ==========================================

    public getUsageStats(): UsageStats {
        return this.usageStats;
    }

    public recordUsage(stats: UsageStats): void {
        this.usageStats.promptTokens += stats.promptTokens;
        this.usageStats.completionTokens += stats.completionTokens;
        this.usageStats.durationMs += stats.durationMs;

        // 安全告警：檢查是否超過臨界值
        const MAX_SAFE_TOKENS = this.config.security.max_safe_tokens ?? 100000;
        const totalTokens = this.usageStats.promptTokens + this.usageStats.completionTokens;
        if (totalTokens > MAX_SAFE_TOKENS) {
            this.logger.warn(`SECURITY WARNING: Token usage exceeded safe threshold (${totalTokens} > ${MAX_SAFE_TOKENS})`);
        }
    }

    // ==========================================
    // 身份綁定與認知設定 (Agent Profile)
    // ==========================================

    /**
     * 產生工具指紋，供快取驗證使用
     */
    protected generateToolsSignature(tools: BaseTool[]): string {
        return tools.map(t => t.name).sort().join(',');
    }
    /**
     * 更新 Agent 裝備的可用工具
     */
    public updateTools(tools: BaseTool[]): void {
        const signature = this.generateToolsSignature(tools);

        // 若工具陣列沒有改變，則保留原本的快取
        if (this.cachedToolsSignature === signature) {
            return;
        }

        this.tools = tools;
        this.cachedToolsSignature = signature;
        this.logger.debug(`Equipped ${tools.length} tools. Cache invalidated.`);
    }

    /**
     * 增加 Agent 裝備的可用工具
     */
    public addTools(tools: BaseTool[]): void {
        this.updateTools([...this.tools, ...tools])
    }

    public setProfile(profile: AgentProfile): void {
        this.profile = profile;
        this.logger.debug(`Agent profile updated.`);
    }

    public getProfile(): AgentProfile | undefined {
        return this.profile;
    }

    public getTools(): BaseTool[] {
        return this.tools;
    }

    /**
     * 將結構化的 JSON Profile 渲染為帶有順序索引的 Prompt 區塊陣列
     */
    protected buildProfilePromptSections(targetProfile?: AgentProfile, envStateOverride?: string): IPromptSection[] {
        const profile = targetProfile || this.profile;
        if (!profile) {
            return [{
                index: PromptSectionIndex.SYSTEM_CORE,
                content: 'You are a helpful autonomous agent.'
            }];
        }

        const sections: IPromptSection[] = [];

        if (profile.mission || profile.principles) {
            let corePrompt = '';
            if (profile.mission) corePrompt += `## MISSION\n${profile.mission}\n\n`;
            if (profile.principles && profile.principles.length > 0) {
                corePrompt += `## PRINCIPLES (CRITICAL)\n`;
                profile.principles.forEach(p => corePrompt += `- ${p}\n`);
            }
            sections.push({ index: PromptSectionIndex.SYSTEM_CORE, content: corePrompt.trim() });
        }

        if (this.envState) {
            sections.push({
                index: PromptSectionIndex.ENVIRONMENT_STATE,
                content: `${this.envState}`
            });
        }

        if (profile.identity) {
            sections.push({
                index: PromptSectionIndex.IDENTITY,
                content: `## IDENTITY\n${profile.identity}`
            });
        }

        if (profile.capabilities || profile.action_guidelines) {
            let tacticalPrompt = '';
            if (profile.capabilities && profile.capabilities.length > 0) {
                tacticalPrompt += `## CAPABILITIES\n`;
                profile.capabilities.forEach(c => tacticalPrompt += `- ${c}\n`);
                tacticalPrompt += `\n`;
            }
            if (profile.action_guidelines && profile.action_guidelines.length > 0) {
                tacticalPrompt += `## ACTION GUIDELINES\n`;
                profile.action_guidelines.forEach(g => tacticalPrompt += `- ${g}\n`);
            }
            sections.push({ index: PromptSectionIndex.TACTICAL_GUIDELINE, content: tacticalPrompt.trim() });
        }

        if (profile.outputFormat) {
            sections.push({
                index: PromptSectionIndex.TOOL_USAGE,
                content: `## OUTPUT FORMAT REQUIREMENTS\n${profile.outputFormat}`
            });
        }

        return sections;
    }

    // ==========================================
    // LangChain 整合 (LLM & Prompt Helpers)
    // ==========================================

    /**
     * 獲取該 Agent 使用的 LangChain Chat Model 實例 (自動依照 preset 從 config 實例化並快取)
     */
    protected getModel(presetName?: string): BaseChatModel {
        const finalPresetName = presetName ?? this.config.llm.default_preset;

        if (!this.llmInstances.has(finalPresetName)) {
            // 根據 preset 讀取對應的配置，若找不到則回退到空配置
            const presetConfig = this.config.llm.presets[finalPresetName] || {};

            this.llmInstances.set(finalPresetName, new ChatOpenAI({
                ...presetConfig
            }));
        }
        return this.llmInstances.get(finalPresetName)!;
    }

    /**
     * 預設的業務處理邏輯 (處理收到的 DataBlock)
     * 從歷史還原上下文、格式化 Prompt、呼叫 LLM，最後將結果回覆給最後一個發送者。
     * 子類別可依需求 Override (例如 TaskAgent 實作 PDCA)
     */
    public async processInbox(messages: DataBlock[], contextOverride?: ContextOverride): Promise<{ usageDelta: UsageStats }> {
        this.logger.info(`Processing ${messages.length} messages.`);

        // 提取覆寫參數 (若無提供則回退到本體狀態)
        const effectiveProfile = contextOverride?.profile ?? this.profile;
        const effectiveTools = contextOverride?.tools ?? this.tools;
        const effectiveEnvState = contextOverride?.envState ?? this.envState;
        const historyTargetId = contextOverride?.agentId ?? this.id;

        // 1. 從倉儲載入完整對話歷史 (若外部傳入 fullHistory 則直接套用，Bypass DB 查詢)
        let allHistoryBlocks = contextOverride?.fullHistory
            ? contextOverride.fullHistory
            : await this.dataBlockRepo.findByAgent(this.sessionId, historyTargetId);

        // 若有額外記憶需要掛載 (且非 FullHistory 覆寫模式)，將其合併並排序
        if (contextOverride?.additionalHistory && !contextOverride?.fullHistory) {
            allHistoryBlocks = [...allHistoryBlocks, ...contextOverride.additionalHistory].sort((a, b) => a.timestamp - b.timestamp);
        }

        // 應用 max_context_window 限制歷史訊息長度，避免超出 LLM Token 上限
        const maxWindow = this.config.agent.max_context_window;
        if (allHistoryBlocks.length > maxWindow) {
            allHistoryBlocks = allHistoryBlocks.slice(-maxWindow);
            this.logger.debug(`Context window truncated to latest ${maxWindow} messages.`);
        }

        const saveTokens = this.config.agent.save_tokens;
        const uncompressedTail = this.config.agent.uncompressed_tail;

        const shouldCompress = (index: number) => {
            return saveTokens && (index < allHistoryBlocks.length - uncompressedTail);
        }

        const historyMessages = allHistoryBlocks.map((m: DataBlock<any>, index: number) => {
            return m.toMessage(this.id, shouldCompress(index));
        });

        this.logger.debug(`Aggregated input for LLM: ${historyMessages.length} historical messages`);

        // 2. 組合所有 Prompt (靜態設定 + 動態 Hook 注入)
        const staticSections = this.buildProfilePromptSections(effectiveProfile, effectiveEnvState);
        const allSections = [...staticSections, ...(contextOverride?.injectedPrompts || [])];

        // 依 index 嚴格排序
        allSections.sort((a, b) => a.index - b.index);
        const systemPrompt = allSections.map(p => p.content).join('\n\n');

        const lcMessages = await this.compileMessages(systemPrompt, undefined, {}, {
            history: historyMessages
        });

        // 3. 呼叫模型
        this.logger.debug(`Invoking LLM...`);
        const { content: replyText, usageDelta } = await this.callModel(lcMessages, {
            presetName: effectiveProfile?.llmPreset,
            overrideTools: effectiveTools
        });

        this.logger.debug(`LLM Respond.`);

        // 4. 將決策傳回給最後的發送者
        const lastMessage = messages[messages.length - 1];
        const replyBlock = new DataBlock({
            sessionId: this.sessionId,
            senderId: historyTargetId,
            targetId: lastMessage?.senderId, // 針對最後一個對話對象回覆
            type: 'ai',
            intent: 'AGENT_REPLY',
            controlPayload: replyText
        });

        // 發布回 EventBus
        await this.eventBus.publishAsync({
            type: AgentEvent.AgentMessage,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            payload: replyBlock
        });

        // 5. 任務完成，回傳消耗增量供上層合併
        return { usageDelta };
    }

    /**
     * 組合 Prompt 範本、變數、歷史紀錄與環境上下文，生成 LangChain 訊息陣列
     */
    protected async compileMessages(
        systemTemplate: string,
        userTemplate?: string,
        variables: Record<string, any> = {},
        options?: {
            history?: BaseMessage[];
        }
    ): Promise<BaseMessage[]> {
        const promptTemplates: any[] = [];

        // 1. 系統提示詞
        promptTemplates.push(['system', systemTemplate]);

        // 2. 建立 ChatPromptTemplate
        const chatPrompt = ChatPromptTemplate.fromMessages(promptTemplates);
        const formattedMessages = await chatPrompt.formatMessages(variables);

        // 4. 合併歷史紀錄與使用者最終輸入
        const finalMessages: BaseMessage[] = [];
        finalMessages.push(...formattedMessages);

        if (options?.history && options.history.length > 0) {
            finalMessages.push(...options.history);
        }

        // 5. 使用者最終 Prompt 組合 (如果有的話)
        if (userTemplate) {
            const userPromptTemplate = ChatPromptTemplate.fromMessages([
                ['human', userTemplate]
            ]);
            const formattedUserMessages = await userPromptTemplate.formatMessages(variables);
            finalMessages.push(...formattedUserMessages);
        }

        return finalMessages;
    }

    /**
     * 呼叫 LLM 模型並整合重試邏輯與 Token/執行時間統計
     */
    protected async callModel(
        messages: BaseMessage[],
        options?: {
            maxRetries?: number;
            presetName?: string;
            overrideTools?: BaseTool[];
        }
    ): Promise<{ content: string, usageDelta: UsageStats }> {
        const presetName = options?.presetName ?? this.config.llm.default_preset;
        const model = this.getModel(presetName);

        // 使用 LangChain 的 .withRetry 封裝重試邏輯
        let modelWithRetry = model.withRetry({
            stopAfterAttempt: options?.maxRetries ?? 3,
        });

        const startTime = Date.now();
        try {
            let finalMessage: AIMessage;
            const activeTools = options?.overrideTools ? options.overrideTools : this.tools;

            if (activeTools.length > 0) {
                // 使用 LLM Preset 與 工具名稱組合做為快取 Key
                const signature = presetName + ':' + this.generateToolsSignature(activeTools);
                let agentToUse = this.reactAgentCache.get(signature);

                // 如果快取不存在，則即時編譯並寫入快取
                if (!agentToUse) {
                    const lcTools = activeTools.map(t => t.toLangChainTool({
                        sessionId: this.sessionId,
                        agentId: this.id,
                        eventBus: this.eventBus
                    }));

                    agentToUse = createAgent({
                        model: modelWithRetry,
                        tools: lcTools
                    });

                    this.reactAgentCache.set(signature, agentToUse);
                    this.logger.debug(`Compiled and cached ReactAgent for signature: [${signature}] with ${lcTools.length} tools.`);
                }

                const result = await agentToUse.invoke({ messages });

                finalMessage = result.messages[result.messages.length - 1] as AIMessage;
            } else {
                finalMessage = await modelWithRetry.invoke(messages);
            }

            const durationMs = Date.now() - startTime;

            // 提取 Token 消耗統計 (從最終對話物件)
            const usageMetadata = finalMessage.usage_metadata;
            let usageDelta: UsageStats = { promptTokens: 0, completionTokens: 0, durationMs };

            if (usageMetadata) {
                usageDelta.promptTokens = usageMetadata.input_tokens ?? 0;
                usageDelta.completionTokens = usageMetadata.output_tokens ?? 0;
            } else {
                // 退一步檢查 additional_kwargs 中的 tokenUsage
                const tokenUsage = (finalMessage.additional_kwargs as any)?.tokenUsage;
                if (tokenUsage) {
                    usageDelta.promptTokens = tokenUsage.promptTokens ?? 0;
                    usageDelta.completionTokens = tokenUsage.completionTokens ?? 0;
                }
            }

            let content = finalMessage.content;
            if (typeof content !== 'string') {
                content = JSON.stringify(content);
            }
            return { content: content as string, usageDelta };
        } catch (error) {
            this.logger.error(`LLM call failed after retries: ${error}`);
            throw error;
        }
    }

    // ==========================================
    // 狀態與生命週期管理
    // ==========================================

    protected setState(newState: AgentState): void {
        if (this.state === AgentState.TERMINATED) {
            this.logger.warn(`Attempted to change state of terminated agent ${this.id}`);
            return;
        }
        const oldState = this.state;
        this.logger.debug(`State transition: ${oldState} -> ${newState}`);
        this.state = newState;

        // 發布狀態改變事件，讓 SessionManager 等外部控制器能進行 Inbox 檢查與資源回收
        this.eventBus.publish({
            type: AgentEvent.AgentStateChanged,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            payload: {
                agentId: this.id,
                oldState,
                newState
            }
        });
    }

    public getState(): AgentState {
        return this.state;
    }

    // ==========================================
    // 狀態持久化與存檔 (State Persistence)
    // ==========================================

    /**
     * 將當前狀態、消耗資訊序列化為 DTO
     */
    public serialize(): BaseAgentData {
        return {
            id: this.id,
            sessionId: this.sessionId,
            type: this.type,
            canClone: this.canClone,
            state: this.state,
            usageStats: { ...this.usageStats },
            timestamp: Date.now(),
            profile: this.profile ? JSON.parse(JSON.stringify(this.profile)) : undefined,
            emotionalState: this.emotionalState ? JSON.parse(JSON.stringify(this.emotionalState)) : undefined,
            workspaceType: this.workspaceType
        };
    }

    /**
     * 從 DTO 還原狀態與消耗資訊
     */
    public hydrate(data: BaseAgentData): void {
        if (data.id !== this.id || data.sessionId !== this.sessionId) {
            throw new Error('Hydration data mismatch with current agent identity.');
        }
        this.state = (data.state as AgentState) ?? AgentState.INITIALIZING;
        this.usageStats = data.usageStats ? { ...data.usageStats } : { promptTokens: 0, completionTokens: 0, durationMs: 0 };
        if (data.profile) {
            this.profile = JSON.parse(JSON.stringify(data.profile));
        }
        if (data.emotionalState) {
            this.emotionalState = JSON.parse(JSON.stringify(data.emotionalState));
        }

        this.logger.debug(`Agent state hydrated from snapshot.`);
    }

    // ==========================================
    // 純粹的生命週期狀態控制方法
    // ==========================================

    /**
     * 標記為初始化完成並進入 IDLE 狀態
     */
    public setReady(): void {
        if (this.state === AgentState.INITIALIZING) {
            this.setState(AgentState.IDLE);
            this.logger.info(`Agent is now ready and IDLE.`);
        }
    }

    /**
     * 主動掛起 (釋放 CPU 與 Token 消耗)
     * 進入 SUSPENDED 前會自動進行狀態存檔
     */
    public suspend(): void {
        this.setState(AgentState.SUSPENDED);
        this.logger.info(`Agent suspended. Waiting for events...`);
    }

    /**
     * 被動喚醒 (由 EventBus 呼叫)
     * 喚醒後切換至 BUSY，並處理收到的事件訊息
     */
    public async resume(messageBatches: DataBlock[][]): Promise<void> {
        this.activeExecutions += messageBatches.length;
        if (this.state !== AgentState.BUSY) {
            this.setState(AgentState.BUSY);
        }
        this.logger.info(`Agent stateless execution started. Incoming message batches: ${messageBatches.length}. Active executions: ${this.activeExecutions}`);

        try {
            // 觸發 BEFORE_AGENT_STEP Hook (單次觸發，供所有併發共用)
            const contextPayload: ContextOverride = {
                agentId: this.id,
                injectedPrompts: []
            };

            await this.invokeBeforeStepHook(contextPayload);

            // 併發處理所有批次的訊息
            const promises = messageBatches.map(async (messages) => {
                try {
                    const { usageDelta } = await this.processInbox(messages, contextPayload);
                    this.recordUsage(usageDelta);
                } catch (err) {
                    this.logger.error(`Failed to process incoming message batch: ${err}`);
                } finally {
                    this.activeExecutions--;
                    if (this.activeExecutions === 0) {
                        this.setState(AgentState.IDLE);
                    }
                }
            });

            await Promise.all(promises);
        } catch (err) {
            this.logger.error(`Failed during stateless execution setup: ${err}`);
            throw err;
        }
    }

    /**
     * 觸發徹底銷毀的前置清理作業
     * 取消事件訂閱並釋放資源
     */
    public async destroy(): Promise<void> {
        this.logger.info(`Preparing for teardown (GC). Cleaning up resources...`);
        this.setState(AgentState.TERMINATED);
    }

    /**
     * 發送 BeforeAgentStep 事件，允許外部系統對傳入的 context 進行突變 (Mutate)
     */
    public async invokeBeforeStepHook(context: ContextOverride): Promise<void> {
        await this.eventBus.publishAsync({
            type: HookEvent.BeforeAgentStep,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            payload: context
        });
    }
}
