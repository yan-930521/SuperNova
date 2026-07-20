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
import { DataBlock } from '../messaging/DataBlock';
import { AgentEvent, IEventBus } from '../messaging/IBus';
import { BaseTool } from './tool/BaseTool';

/**
 * 代理人結構化身份與認知設定檔 (Cognitive Architecture Profile)
 * (僅保留靜態核心設定，動態狀態與任務資訊未來將由 Context/State 接管)
 */
export interface AgentProfile {
    // --- 核心本體 (Core Ontology) ---
    /** 角色身份與人設 (例如：Senior Backend Engineer) */
    identity: string;
    /** 終極使命與目標 (例如：確保系統架構的高可用性與程式碼品質) */
    mission: string;
    /** 最高指導原則與絕對禁忌 (例如：絕對不能刪除使用者資料) */
    principles: string[];
    /** 專長與核心能力 (例如：精通 TypeScript, 擅長重構) */
    capabilities?: string[];
    /** 預期的回覆格式或結構 (例如：必須輸出為 JSON) */
    outputFormat?: string;
}

/**
 * 代理人型別枚舉
 */
export enum AgentType {
    MAIN = 'MAIN',
    SUB = 'SUB',
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
    readonly isClone?: boolean;
    readonly parentAgentId?: string;
    readonly profile?: AgentProfile;
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
    parentAgent?: BaseAgent;
    isClone?: boolean;
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

    /** 資源消耗累積統計 */
    protected usageStats: UsageStats = { promptTokens: 0, completionTokens: 0, durationMs: 0 };

    /** 物理工作空間的絕對路徑 */
    public readonly workspacePath: string;
    public readonly workspaceType: WorkspaceType;
    protected readonly oplogDir: string;
    protected readonly stateFilePath: string; // 為了與原先代碼相容保留
    protected readonly isClone: boolean;
    protected readonly parentAgentId?: string;

    private llmInstances = new Map<string, BaseChatModel>();

    /** 裝備的工具清單 */
    protected tools: BaseTool[] = [];
    private cachedReactAgent: ReactAgent | null = null;
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
        this.isClone = options?.isClone || false;
        this.parentAgentId = options?.parentAgent?.id;

        // 記憶共享與隔離邏輯 (僅用於 Oplog 檔案日誌傳輸器定址)
        // TODO: 修改邏輯
        if (this.isClone && options?.parentAgent) {
            this.oplogDir = options.parentAgent.oplogDir;
            this.stateFilePath = path.join(this.oplogDir, `state_${this.id}.json`);
        } else {
            this.oplogDir = path.join(
                process.cwd(),
                this.config.storage.base_dir,
                this.config.storage.session_dir,
                this.sessionId,
                this.config.storage.agent_dir,
                this.id
            );
            this.stateFilePath = path.join(this.oplogDir, 'state.json');
        }

        this.logger.addTransport(new FileTransport('DEBUG', this.oplogDir, this.config.storage.oplog_file));
        this.logger.info(`Initializing agent: ${this.id} under session: ${this.sessionId}`);
    }

    // ==========================================
    // 資源消耗追蹤
    // ==========================================

    public getUsageStats(): UsageStats {
        return this.usageStats;
    }

    public mergeUsage(stats: UsageStats): void {
        this.usageStats.promptTokens += stats.promptTokens;
        this.usageStats.completionTokens += stats.completionTokens;
        this.usageStats.durationMs += stats.durationMs;
    }

    // ==========================================
    // 身份綁定與認知設定 (Agent Profile)
    // ==========================================

    /**
     * 更新 Agent 裝備的可用工具
     */
    public updateTools(tools: BaseTool[]): void {
        const signature = tools.map(t => t.name).sort().join(',');

        // 若工具陣列沒有改變，則保留原本的 ReactAgent 快取
        if (this.cachedToolsSignature === signature) {
            return;
        }

        this.tools = tools;
        this.cachedToolsSignature = signature;
        this.cachedReactAgent = null; // 清除快取，強制下次重新編譯
        this.logger.debug(`Equipped ${tools.length} tools. Cache invalidated.`);
    }

    public setProfile(profile: AgentProfile): void {
        this.profile = profile;
        this.logger.debug(`Agent profile updated.`);
    }

    public getProfile(): AgentProfile | undefined {
        return this.profile;
    }

    /**
     * 將結構化的 JSON Profile 渲染為 LLM 可理解的 System Prompt 文字
     */
    protected formatProfileToSystemPrompt(): string {
        if (!this.profile) {
            return 'You are a helpful autonomous agent.';
        }

        let prompt = `## IDENTITY\n${this.profile.identity}\n\n`;
        prompt += `## MISSION\n${this.profile.mission}\n\n`;

        if (this.profile.principles && this.profile.principles.length > 0) {
            prompt += `## PRINCIPLES (CRITICAL)\n`;
            this.profile.principles.forEach(p => prompt += `- ${p}\n`);
            prompt += `\n`;
        }

        if (this.profile.capabilities && this.profile.capabilities.length > 0) {
            prompt += `## CAPABILITIES\n`;
            this.profile.capabilities.forEach(c => prompt += `- ${c}\n`);
            prompt += `\n`;
        }

        if (this.profile.outputFormat) {
            prompt += `## OUTPUT FORMAT REQUIREMENTS\n${this.profile.outputFormat}\n\n`;
        }

        return prompt.trim();
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
     * 子類別可依需求 Override (例如 SubAgent 實作 PDCA)
     */
    protected async processInbox(messages: DataBlock[]): Promise<void> {
        this.logger.info(`Processing ${messages.length} messages.`);

        // 1. 從倉儲載入完整對話歷史 (包含剛被 SessionManager 寫入的最新 DataBlock)
        const historyTargetId = this.isClone && this.parentAgentId ? this.parentAgentId : this.id;
        const allHistoryBlocks = await this.dataBlockRepo.findByAgent(this.sessionId, historyTargetId);
        const historyMessages = allHistoryBlocks.map((m: DataBlock<any>) => m.toMessage(this.id));

        this.logger.debug(`Aggregated input for LLM: ${historyMessages.length} historical messages`);

        // 2. 利用基礎設施轉譯為 LangChain Messages
        const systemPrompt = this.formatProfileToSystemPrompt();
        const lcMessages = await this.compileMessages(systemPrompt, undefined, {}, { history: historyMessages });

        // 3. 呼叫模型
        this.logger.debug(`Invoking LLM...`);
        const replyText = await this.callModel(lcMessages);

        this.logger.debug(`LLM Response: ${replyText}`);

        // 4. 將決策傳回給最後的發送者
        const lastMessage = messages[messages.length - 1];
        const replyBlock = new DataBlock({
            sessionId: this.sessionId,
            senderId: historyTargetId, // 若為 Clone，則偽裝成 Parent 的身分發送，以利全局 Oplog 統合
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

        // 5. 任務完成，切換回 IDLE 等待下一次事件喚醒
        this.setState(AgentState.IDLE);
    }

    /**
     * 組合 Prompt 範本、變數、歷史紀錄與環境上下文，生成 LangChain 訊息陣列
     */
    protected async compileMessages(
        systemTemplate: string,
        userTemplate?: string,
        variables: Record<string, any> = {},
        options?: {
            envPrompt?: string;
            history?: BaseMessage[];
        }
    ): Promise<BaseMessage[]> {
        const promptTemplates: any[] = [];

        // 1. 系統提示詞
        promptTemplates.push(['system', systemTemplate]);

        // 2. 注入具身智能環境上下文 (若有)
        if (options?.envPrompt) {
            promptTemplates.push(['system', `[ENVIRONMENT CONTEXT]\n${options.envPrompt}`]);
        }

        // 3. 建立 ChatPromptTemplate
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
        }
    ): Promise<string> {
        const presetName = options?.presetName ?? this.config.llm.default_preset;
        const model = this.getModel(presetName);

        // 使用 LangChain 的 .withRetry 封裝重試邏輯
        let modelWithRetry = model.withRetry({
            stopAfterAttempt: options?.maxRetries ?? 3,
        });

        const startTime = Date.now();
        try {
            let finalMessage: AIMessage;

            if (this.tools.length > 0) {
                if (!this.cachedReactAgent) {
                    const lcTools = this.tools.map(t => t.toLangChainTool({
                        sessionId: this.sessionId,
                        agentId: this.id,
                        workspacePath: this.workspacePath
                    }));

                    this.cachedReactAgent = createAgent({
                        model: modelWithRetry,
                        tools: lcTools
                    });
                    this.logger.debug(`Compiled and cached new ReactAgent with ${lcTools.length} tools.`);
                }

                const result = await this.cachedReactAgent.invoke({ messages });

                finalMessage = result.messages[result.messages.length - 1] as AIMessage;
            } else {
                finalMessage = await modelWithRetry.invoke(messages);
            }

            const durationMs = Date.now() - startTime;

            // 提取 Token 消耗統計 (從最終對話物件)
            const usageMetadata = finalMessage.usage_metadata;
            if (usageMetadata) {
                this.recordUsage(
                    usageMetadata.input_tokens ?? 0,
                    usageMetadata.output_tokens ?? 0,
                    durationMs
                );
            } else {
                // 退一步檢查 additional_kwargs 中的 tokenUsage
                const tokenUsage = (finalMessage.additional_kwargs as any)?.tokenUsage;
                if (tokenUsage) {
                    this.recordUsage(
                        tokenUsage.promptTokens ?? 0,
                        tokenUsage.completionTokens ?? 0,
                        durationMs
                    );
                } else {
                    // 若無法取得 Token 數量，僅記錄執行時間
                    this.recordUsage(0, 0, durationMs);
                }
            }

            const content = finalMessage.content;
            if (typeof content === 'string') {
                return content;
            }
            return JSON.stringify(content);
        } catch (error) {
            this.logger.error(`LLM call failed after retries: ${error}`);
            throw error;
        }
    }

    // ==========================================

    // ==========================================
    // 資源消耗輔助 (Usage & Token Tracking)
    // ==========================================

    /**
     * 供子類別回報資源消耗量
     */
    public recordUsage(promptTokens: number, completionTokens: number, durationMs: number): void {
        this.usageStats.promptTokens += promptTokens;
        this.usageStats.completionTokens += completionTokens;
        this.usageStats.durationMs += durationMs;

        // 安全告警：檢查是否超過臨界值
        const MAX_SAFE_TOKENS = this.config.security.max_safe_tokens ?? 100000;
        const totalTokens = this.usageStats.promptTokens + this.usageStats.completionTokens;
        if (totalTokens > MAX_SAFE_TOKENS) {
            this.logger.warn(`SECURITY WARNING: Token usage exceeded safe threshold (${totalTokens} > ${MAX_SAFE_TOKENS})`);
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
        this.logger.debug(`State transition: ${this.state} -> ${newState}`);
        this.state = newState;
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
            isClone: this.isClone,
            parentAgentId: this.parentAgentId,
            profile: this.profile ? JSON.parse(JSON.stringify(this.profile)) : undefined,
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
        if (this.state !== AgentState.SUSPENDED && this.state !== AgentState.IDLE && this.state !== AgentState.INITIALIZING) {
            this.logger.warn(`Resume ignored. Current state is ${this.state}`);
            return;
        }

        this.setState(AgentState.BUSY);
        this.logger.info(`Agent resumed. Incoming messages: ${messages.length}`);

        try {
            await this.processInbox(messages);
        } catch (err) {
            this.logger.error(`Failed to process incoming message: ${err}`);
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
}
