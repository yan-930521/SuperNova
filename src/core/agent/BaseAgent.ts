import { createAgent, ReactAgent } from 'langchain';
import * as path from 'path';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { DEFAULT_CONFIG } from '../config';
import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { IDataBlockRepository, IEntity } from '../infra/persistence/IRepository';
import { WorkspaceType } from '../infra/persistence/IWorkspaceManager';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { DataBlock, MessagePriority } from '../messaging/DataBlock';
import {
    AgentEvent, GlobalEventMap, HookEvent, IEvent, IEventBus, IPromptSection, PromptSectionIndex
} from '../messaging/IBus';
import { LLMProvider } from './LLMProvider';
import { SYSTEM_PROMPTS } from './prompts';
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
    llmProvider: LLMProvider; // 注入全域 LLMProvider
    eventBus: IEventBus;
    config: Config;
    dataBlockRepo: IDataBlockRepository;
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
    protected readonly llmProvider: LLMProvider;

    /** 裝備的工具清單 */
    protected tools: BaseTool[] = [];
    private reactAgentCache = new Map<string, ReactAgent>();
    private cachedToolsSignature: string = '';
    private toolsSignatureCache = new WeakMap<BaseTool[], string>();
    private profileHashCache = new WeakMap<any, string>();
    protected eventSubscriptions: Array<{ type: string, handler: any }> = [];

    private historyCache: {
        blockCount: number;
        messages: BaseMessage[];
        profileHash: string;
        systemPrompt: string;
    } | null = null;

    protected readonly eventBus: IEventBus;
    protected readonly config: Config;
    protected readonly dataBlockRepo: IDataBlockRepository;

    constructor(
        public readonly id: string,
        public readonly sessionId: string, // 強制綁定會話 ID，所有衍生 Agent/Worker 均依附於此會話
        options: AgentOptions
    ) {
        this.eventBus = options.eventBus;
        this.config = options.config;
        this.dataBlockRepo = options.dataBlockRepo;
        this.state = AgentState.INITIALIZING;

        // 注入專屬的 Contextual Logger，追蹤這個 Agent 的所有行為
        this.logger = new LogManager({ agent_id: this.id, session_id: this.sessionId, type: 'AGENT' });
        // 安裝 Console 傳輸器，並使用 [Agent:<id>] 作為前綴標籤，以避免日誌調用時重複添加前綴
        this.logger.addTransport(new ConsoleTransport('DEBUG', `[Agent:${this.id}]`));

        // 物理工作空間路徑指派
        this.workspacePath = options?.workspacePath || '';
        this.workspaceType = options?.workspaceType || 'PERSISTENT';
        this.oplogDir = path.join(
            process.cwd(),
            this.config.storage.base_dir,
            this.config.storage.session_dir,
            this.sessionId,
            this.config.storage.agent_dir,
            this.id
        );
        this.stateFilePath = path.join(this.oplogDir, 'state.json');

        this.llmProvider = options.llmProvider;

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
        this.subscribeEvent(AgentEvent.WorldUpdated, (event: any) => {
            if (event.payload.agentId === this.id) {
                this.envState = event.payload.worldState;
            }
        });
    }

    /**
     * 安全訂閱事件，並在 destroy 時自動清理，防止殭屍監聽器
     */
    protected subscribeEvent<T extends Extract<keyof GlobalEventMap, string>>(
        type: T,
        handler: (event: IEvent<T>) => void | Promise<void>,
        options?: { sessionId?: string }
    ): void {
        this.eventBus.subscribe(type, handler, options);
        this.eventSubscriptions.push({ type, handler });
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
        const MAX_SAFE_TOKENS = this.config.security.max_safe_tokens ?? DEFAULT_CONFIG.security.max_safe_tokens!;
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
        if (this.toolsSignatureCache.has(tools)) {
            return this.toolsSignatureCache.get(tools)!;
        }
        const sig = tools.map(t => t.name).sort().join(',');
        this.toolsSignatureCache.set(tools, sig);
        return sig;
    }

    /**
     * 產生 Profile Hash，供快取驗證使用
     */
    protected generateProfileHash(profile: any, envState: string): string {
        let pHash = '';
        if (profile) {
            if (this.profileHashCache.has(profile)) {
                pHash = this.profileHashCache.get(profile)!;
            } else {
                pHash = JSON.stringify(profile);
                this.profileHashCache.set(profile, pHash);
            }
        }
        return pHash + '|' + envState;
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

        // --- 1. SYSTEM_CORE ---
        const corePrompts: string[] = [];
        corePrompts.push(SYSTEM_PROMPTS.COMMUNICATION_PROTOCOL, "");
        corePrompts.push(SYSTEM_PROMPTS.NETWORK_COMMUNICATION, "");

        if (profile.mission) {
            corePrompts.push("## MISSION\n" + profile.mission, "");
        }
        if (profile.principles && profile.principles.length > 0) {
            corePrompts.push("## PRINCIPLES (CRITICAL)");
            profile.principles.forEach(p => corePrompts.push(`- ${p}`));
            corePrompts.push("");
        }
        const corePrompt = corePrompts.join('\n');
        if (corePrompt.trim()) {
            sections.push({ index: PromptSectionIndex.SYSTEM_CORE, content: corePrompt.trim() });
        }

        // --- 2. IDENTITY ---
        if (profile.identity) {
            sections.push({
                index: PromptSectionIndex.IDENTITY,
                content: `## IDENTITY\n${profile.identity}`
            });
        }

        // --- 3. TACTICAL_GUIDELINE ---
        const tacticalPrompts: string[] = [];
        tacticalPrompts.push(SYSTEM_PROMPTS.CONSCIOUSNESS_PROJECTION, "");

        if (profile.capabilities && profile.capabilities.length > 0) {
            tacticalPrompts.push("## CAPABILITIES");
            profile.capabilities.forEach(c => tacticalPrompts.push(`- ${c}`));
            tacticalPrompts.push("");
        }
        if (profile.action_guidelines && profile.action_guidelines.length > 0) {
            tacticalPrompts.push("## ACTION GUIDELINES");
            profile.action_guidelines.forEach(g => tacticalPrompts.push(`- ${g}`));
            tacticalPrompts.push("");
        }
        if (profile.outputFormat) {
            tacticalPrompts.push("## OUTPUT FORMAT REQUIREMENTS\n" + profile.outputFormat, "");
        }
        const tacticalPrompt = tacticalPrompts.join('\n');
        if (tacticalPrompt.trim()) {
            sections.push({ index: PromptSectionIndex.TACTICAL_GUIDELINE, content: tacticalPrompt.trim() });
        }

        // --- 4. ENVIRONMENT_STATE ---
        const envState = envStateOverride !== undefined ? envStateOverride : this.envState;
        if (envState) {
            sections.push({
                index: PromptSectionIndex.ENVIRONMENT_STATE,
                content: `${envState}`
            });
        }

        // --- 6. TOOL_USAGE ---
        const toolUsagePrompts: string[] = [];
        toolUsagePrompts.push(SYSTEM_PROMPTS.TOOL_USAGE_AND_VERIFICATION, "");
        toolUsagePrompts.push(SYSTEM_PROMPTS.DATA_POINTER_HANDLING, "");

        const toolUsagePrompt = toolUsagePrompts.join('\n');
        if (toolUsagePrompt.trim()) {
            sections.push({
                index: PromptSectionIndex.TOOL_USAGE,
                content: toolUsagePrompt.trim()
            });
        }

        return sections;
    }

    // ==========================================
    // LangChain 整合 (LLM & Prompt Helpers)
    // ==========================================

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

        const staticSections = this.buildProfilePromptSections(effectiveProfile, effectiveEnvState);
        const allSections = [...staticSections, ...(contextOverride?.injectedPrompts || [])];
        allSections.sort((a, b) => a.index - b.index);
        const systemPrompt = allSections.map(p => p.content).join('\n\n');
        const profileHash = this.generateProfileHash(effectiveProfile, effectiveEnvState);

        const historyMessages = this.buildHistoryMessagesIncremental(allHistoryBlocks, shouldCompress, profileHash, systemPrompt);

        this.logger.debug(`Aggregated input for LLM: ${historyMessages.length} historical messages`);



        const lcMessages = await this.compileMessages(systemPrompt, undefined, {}, {
            history: historyMessages
        });

        // 3. 呼叫模型
        this.logger.debug(`Invoking LLM...`);
        const { newBlocks, usageDelta } = await this.callModel(lcMessages, {
            presetName: effectiveProfile?.llmPreset,
            overrideTools: effectiveTools,
            senderId: historyTargetId
        });

        this.logger.debug(`LLM Respond with ${newBlocks.length} new blocks.`);

        // 4. 將決策廣播至整個 Session (若需私訊，LLM 應呼叫 SendMessageTool)
        // newBlocks 裡已經包含了 LLM 思考、工具呼叫、最後回覆的完整陣列

        // 發布回 EventBus (SessionManager 的 handleAgentMessage 已經支援接收陣列)
        if (newBlocks.length > 0) {
            await this.eventBus.publishAsync({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId: this.sessionId,
                payload: newBlocks
            });
        }

        // 5. 任務完成，回傳消耗增量供上層合併
        return { usageDelta };
    }

    /**
     * 負責將原始的 DataBlock 轉換為 LangChain 的 BaseMessage，並支援動態的時間感知插針
     */
    protected injectTemporalMarker(prevM: DataBlock, m: DataBlock, outputArray: BaseMessage[]): void {
        const enableTemporalInjection = this.config.agent.enable_temporal_injection ?? true;
        if (!enableTemporalInjection) return;

        const temporalThresholdMs = this.config.agent.temporal_threshold_ms;
        const timeDiff = m.timestamp - prevM.timestamp;

        if (timeDiff > temporalThresholdMs) {
            const minutes = Math.floor(timeDiff / 60000);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            let timeStr = '';
            if (days > 0) timeStr = `${days} 天 ${hours % 24} 小時`;
            else if (hours > 0) timeStr = `${hours} 小時 ${minutes % 60} 分鐘`;
            else timeStr = `${minutes} 分鐘`;

            outputArray.push(new SystemMessage(`[系統提示：距離上一次對話已過 ${timeStr}]`));
        }
    }

    protected buildHistoryMessages(blocks: readonly DataBlock[], shouldCompress: (index: number) => boolean): BaseMessage[] {
        const historyMessages: BaseMessage[] = [];
        for (let i = 0; i < blocks.length; i++) {
            if (i > 0) {
                this.injectTemporalMarker(blocks[i - 1], blocks[i], historyMessages);
            }
            historyMessages.push(blocks[i].toMessage(this.id, shouldCompress(i)));
        }
        return historyMessages;
    }

    protected buildHistoryMessagesIncremental(
        allBlocks: readonly DataBlock[],
        shouldCompress: (index: number) => boolean,
        profileHash: string,
        systemPrompt: string
    ): BaseMessage[] {
        if (this.historyCache &&
            this.historyCache.blockCount <= allBlocks.length &&
            this.historyCache.profileHash === profileHash &&
            this.historyCache.systemPrompt === systemPrompt) {

            const cachedCount = this.historyCache.blockCount;
            const newBlocks = allBlocks.slice(cachedCount);

            if (newBlocks.length === 0) {
                return this.historyCache.messages;
            }

            const newMessages: BaseMessage[] = [];
            for (let i = 0; i < newBlocks.length; i++) {
                const globalIndex = cachedCount + i;
                if (globalIndex > 0) {
                    this.injectTemporalMarker(allBlocks[globalIndex - 1], newBlocks[i], newMessages);
                }
                newMessages.push(newBlocks[i].toMessage(this.id, shouldCompress(globalIndex)));
            }

            const merged = [...this.historyCache.messages, ...newMessages];
            this.historyCache = { blockCount: allBlocks.length, messages: merged, profileHash, systemPrompt };
            return merged;
        }

        const messages = this.buildHistoryMessages(allBlocks, shouldCompress);
        this.historyCache = { blockCount: allBlocks.length, messages, profileHash, systemPrompt };
        return messages;
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
            senderId?: string;
            targetId?: string;
        }
    ): Promise<{ newBlocks: DataBlock[], usageDelta: UsageStats }> {
        const presetName = options?.presetName ?? this.config.llm.default_preset;
        const senderId = options?.senderId ?? this.id;
        const targetId = options?.targetId ?? null;
        const model = this.llmProvider.getModel(presetName);

        // 使用 LangChain 的 .withRetry 封裝重試邏輯
        let modelWithRetry = model.withRetry({
            stopAfterAttempt: options?.maxRetries ?? 3,
        });

        const startTime = Date.now();
        try {
            let finalMessage: AIMessage;
            let newMessages: BaseMessage[] = [];
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

                newMessages = result.messages.slice(messages.length);
                finalMessage = result.messages[result.messages.length - 1] as AIMessage;
            } else {
                finalMessage = (await modelWithRetry.invoke(messages)) as AIMessage;
                newMessages = [finalMessage];
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

            // 將新產生的 LangChain 訊息映射為 SuperNova 的 DataBlock 陣列
            const newBlocks: DataBlock<any>[] = [];
            const toolCallMap = new Map<string, any>();
            
            // 預先收集 tool_calls，避免後續陣列反向查找的 O(N^2) 效能問題
            for (const m of newMessages) {
                if (m.type === 'ai') {
                    const aiMsg = m as AIMessage;
                    if (aiMsg.tool_calls) {
                        for (const call of aiMsg.tool_calls) {
                            if (call.id) {
                                toolCallMap.set(call.id, call.args);
                            }
                        }
                    }
                }
            }

            for (const m of newMessages) {
                if (m.type === 'ai') {
                    const aiMsg = m as AIMessage;
                    if (typeof aiMsg.content !== 'string') {
                        aiMsg.content.forEach((cb) => {
                            let content = "";
                            if (cb.type === 'text') content = `${cb.text}`;
                            else if (cb.type === 'reasoning') content = `${cb.reasoning}`;

                            newBlocks.push(new DataBlock({
                                sessionId: this.sessionId,
                                senderId,
                                targetId,
                                type: 'ai',
                                intent: 'AGENT_REPLY',
                                controlPayload: content
                            }));
                        })
                    } else if (aiMsg.content.trim() !== '') {
                        newBlocks.push(new DataBlock({
                            sessionId: this.sessionId,
                            senderId,
                            targetId,
                            type: 'ai',
                            intent: 'AGENT_REPLY',
                            controlPayload: aiMsg.content
                        }));
                    }
                } else if (m.type === 'tool') {
                    const toolMsg = m as ToolMessage;
                    let args = toolCallMap.get(toolMsg.tool_call_id) || {};
                    newBlocks.push(new DataBlock({
                        sessionId: this.sessionId,
                        senderId,
                        targetId,
                        type: 'tool',
                        intent: 'TOOL_CALL',
                        controlPayload: { toolName: toolMsg.name || 'unknown', args, result: toolMsg.content }
                    }));
                }
            }

            // Fallback，確保至少有一個最終結論
            if (newBlocks.length === 0 && finalMessage) {
                let content = finalMessage.content;
                if (typeof content !== 'string') content = JSON.stringify(content);
                newBlocks.push(new DataBlock({
                    sessionId: this.sessionId,
                    senderId,
                    targetId,
                    type: 'ai',
                    intent: 'AGENT_REPLY',
                    controlPayload: content || '(empty)'
                }));
            }

            return { newBlocks, usageDelta };
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
            profile: this.profile ? structuredClone(this.profile) : undefined,
            emotionalState: this.emotionalState ? structuredClone(this.emotionalState) : undefined,
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
            this.profile = structuredClone(data.profile);
        }
        if (data.emotionalState) {
            this.emotionalState = structuredClone(data.emotionalState);
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
    public async resume(messages: DataBlock[]): Promise<void> {
        this.activeExecutions += 1;
        if (this.state !== AgentState.BUSY) {
            this.setState(AgentState.BUSY);
        }
        this.logger.info(`Agent stateless execution started. Incoming messages: ${messages.length}. Active executions: ${this.activeExecutions}`);

        try {
            // 觸發 BEFORE_AGENT_STEP Hook (單次觸發)
            const contextPayload: ContextOverride = {
                agentId: this.id,
                injectedPrompts: []
            };

            await this.invokeBeforeStepHook(contextPayload);

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

        for (const sub of this.eventSubscriptions) {
            this.eventBus.unsubscribe(sub.type, sub.handler);
        }
        this.logger.debug(`Cleaned up ${this.eventSubscriptions.length} event subscriptions.`);
        this.eventSubscriptions = [];
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
