import { createAgent, ReactAgent } from 'langchain';
import { z } from 'zod';

import {
    AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
} from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ILLMProvider } from '@supernova/common/llm/types';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import {
    AgentEvent, HookEvent, IEventBus, IPromptSection, SessionEvent, SessionMessageType
} from '@supernova/events/IBus';

import { IConfigManager } from '../../../packages/common/src/config';
import { DataBlock, MessagePriority } from '../messaging';
import { AgentState, IAgent, IAgentContext, IAgentModule, RunContext, UsageStats } from './types';

/**
 * UniversalAgent 初始化選項
 */
export interface UniversalAgentOptions {
    /** 所屬會話 ID (若有) */
    sessionId?: string;
    /** 使用的 LLM Preset 名稱，預設使用 default */
    presetName?: string;
    /** 單次執行最大思考步驟上限，防止無限遞迴 (預設 10) */
    maxSteps?: number;
    /** 重試次數 (預設 3) */
    maxRetries?: number;
    /** 全域配置管理器 (可選) */
    config?: IConfigManager;
}

/**
 * 模型呼叫選項
 */
export interface CallModelOptions {
    maxRetries?: number;
    presetName?: string;
    overrideTools?: any[];
    senderId?: string;
    targetId?: string;
}

/**
 * 模型呼叫回傳結果封裝
 */
export interface CallModelResult {
    finalMessage: AIMessage;
    newBlocks: DataBlock[];
    usageDelta: UsageStats;
}

/**
 * SuperNova 極簡組合式通用代理容器 (UniversalAgent)
 * 遵循「一切皆模組」哲學：
 * 1. 容器本身為純狀態機與調度管線，器官 (記憶、歷史、工具、情緒) 皆可熱插拔
 * 2. 整合 LangChain 官方 ReactAgent (createAgent) 與模型呼叫 (callModel)，具備快取與自動重試
 * 3. 完整貫通 EventBus：狀態遷移、思考步驟切面與工具調用均進行標準事件廣播
 */
export class UniversalAgent implements IAgent {
    public readonly id: string;
    public sessionId?: string;
    public presetName: string;
    public readonly maxSteps: number;
    public readonly maxRetries: number;

    /** 累積資源與 Token 消耗統計 */
    public usageStats: UsageStats = { promptTokens: 0, completionTokens: 0, durationMs: 0 };

    private _state: AgentState = AgentState.INITIALIZING;
    private readonly eventBus: IEventBus;
    private readonly llmProvider: ILLMProvider;
    private readonly config?: IConfigManager;

    /** 已掛載之模組對應表 (moduleName -> IAgentModule) */
    private readonly modules = new Map<string, IAgentModule>();

    /** 按優先級 (priority) 升冪排序之模組快取清單 */
    private sortedModules: IAgentModule[] = [];

    /** ReactAgent 快取表 (presetName:toolsSignature -> ReactAgent) */
    private readonly reactAgentCache = new Map<string, ReactAgent>();

    private readonly logger: LogManager;

    constructor(
        id: string,
        eventBus: IEventBus,
        llmProvider: ILLMProvider,
        options?: UniversalAgentOptions
    ) {
        this.id = id;
        this.sessionId = options?.sessionId;
        this.eventBus = eventBus;
        this.llmProvider = llmProvider;
        this.presetName = options?.presetName ?? 'default';
        this.maxSteps = options?.maxSteps ?? 10;
        this.maxRetries = options?.maxRetries ?? 3;
        this.config = options?.config;

        this.logger = new LogManager({ type: 'SYSTEM', name: `Agent:${this.id}` }).addTransport(
            new ConsoleTransport('DEBUG')
        );

        this.setState(AgentState.IDLE);
    }

    /** 獲取當前代理運行狀態 */
    public get state(): AgentState {
        return this._state;
    }

    // ─── 生命週期規範 (ILifecycle) ───

    public async initialize(): Promise<void> {
        this.logger.info(`Initializing UniversalAgent [${this.id}]...`);
        this.setState(AgentState.IDLE);
    }

    public async start(): Promise<void> {
        this.logger.info(`Starting UniversalAgent [${this.id}]...`);
        this.setState(AgentState.IDLE);
    }

    public async stop(): Promise<void> {
        this.logger.info(`Stopping UniversalAgent [${this.id}]...`);
        this.setState(AgentState.STOPPED);

        // 逆序優雅卸載所有已掛載的模組
        const reversed = [...this.sortedModules].reverse();
        for (const mod of reversed) {
            try {
                await mod.onDetach();
            } catch (err) {
                this.logger.error(`Error detaching module [${mod.name}]: ${String(err)}`);
            }
        }
        this.modules.clear();
        this.sortedModules = [];
        this.reactAgentCache.clear();
    }

    // ─── 模組 (器官) 插拔管理 ───

    /**
     * 掛載模組，自動進行依賴校驗 (requires) 與衝突檢查 (conflicts)
     */
    public async attachModule(module: IAgentModule): Promise<this> {
        if (this.modules.has(module.name)) {
            throw new Error(`Module [${module.name}] is already attached to agent [${this.id}]`);
        }

        // 檢查互斥衝突模組
        if (module.conflicts && module.conflicts.length > 0) {
            for (const conflictName of module.conflicts) {
                if (this.modules.has(conflictName)) {
                    throw new Error(
                        `Module [${module.name}] conflicts with already attached module [${conflictName}]`
                    );
                }
            }
        }

        // 檢查前置依賴模組
        if (module.requires && module.requires.length > 0) {
            for (const reqName of module.requires) {
                if (!this.modules.has(reqName)) {
                    throw new Error(
                        `Module [${module.name}] requires module [${reqName}], which is not attached`
                    );
                }
            }
        }

        // 構造提供給模組的安全 AgentContext 沙盒
        const agentContext: IAgentContext = {
            agentId: this.id,
            sessionId: this.sessionId,
            eventBus: this.eventBus,
            llmProvider: this.llmProvider,
            config: this.config,
            hasModule: (name: string) => this.hasModule(name),
            getModule: <T extends IAgentModule>(name: string) => this.getModule<T>(name),
            setPresetName: (presetName: string) => this.setPresetName(presetName),
        };

        await module.onAttach(agentContext);
        this.modules.set(module.name, module);
        this.rebuildSortedModules();

        this.logger.debug(
            `Attached module [${module.name}] (priority: ${module.priority}) to agent [${this.id}]`
        );
        return this;
    }

    /**
     * 動態設定或切換 Agent 推論使用的 LLM Preset 名稱
     * @param presetName 新的 LLM Preset 名稱
     */
    public setPresetName(presetName: string): void {
        const oldPreset = this.presetName;
        this.presetName = presetName;
        this.logger.info(`Agent [${this.id}] LLM preset switched from [${oldPreset}] to [${presetName}]`);
    }

    /**
     * 卸載模組
     */
    public async detachModule(moduleName: string): Promise<boolean> {
        const mod = this.modules.get(moduleName);
        if (!mod) {
            return false;
        }

        await mod.onDetach();
        this.modules.delete(moduleName);
        this.rebuildSortedModules();
        this.logger.debug(`Detached module [${moduleName}] from agent [${this.id}]`);
        return true;
    }

    public getModule<T extends IAgentModule>(name: string): T | undefined {
        return this.modules.get(name) as T | undefined;
    }

    public hasModule(name: string): boolean {
        return this.modules.has(name);
    }

    // ─── 核心呼叫模型管線 (callModel) ───

    /**
     * 呼叫 LLM 模型並整合重試邏輯、Token/執行時間統計與 LangChain 官方 ReactAgent (createAgent)
     * @param messages 輸入的 LangChain 訊息清單
     * @param options 呼叫可選參數
     */
    public async callModel(
        messages: BaseMessage[],
        options?: CallModelOptions
    ): Promise<CallModelResult> {
        const presetName = options?.presetName ?? this.presetName;
        const senderId = options?.senderId ?? this.id;
        const targetId = options?.targetId ?? null;
        const model = this.llmProvider.getModel(presetName);

        // 使用 LangChain 的 .withRetry 封裝重試邏輯 (若支援)
        const modelWithRetry =
            typeof (model as any).withRetry === 'function'
                ? (model as any).withRetry({
                      stopAfterAttempt: options?.maxRetries ?? this.maxRetries,
                  })
                : model;

        const startTime = Date.now();

        try {
            let finalMessage: AIMessage;
            let newMessages: BaseMessage[] = [];
            const activeTools = options?.overrideTools ?? [];

            if (activeTools.length > 0) {
                // 使用 Preset 名稱與工具特徵簽名組合為快取 Key
                const signature = `${presetName}:${this.generateToolsSignature(activeTools)}`;
                let agentToUse = this.reactAgentCache.get(signature);

                // 若快取不存在，動態編譯 LangChain ReactAgent 並寫入快取
                if (!agentToUse) {
                    const lcTools = this.normalizeTools(activeTools);
                    agentToUse = createAgent({
                        model: modelWithRetry,
                        tools: lcTools,
                    });
                    this.reactAgentCache.set(signature, agentToUse);
                    this.logger.debug(
                        `Compiled and cached ReactAgent for [${signature}] with ${lcTools.length} tools.`
                    );
                }

                const result = await agentToUse.invoke({ messages });
                newMessages = result.messages.slice(messages.length);
                finalMessage = result.messages[result.messages.length - 1] as AIMessage;
            } else {
                const response = await modelWithRetry.invoke(messages);
                finalMessage =
                    response instanceof AIMessage
                        ? response
                        : new AIMessage({
                              content: typeof response === 'string' ? response : response.content || '',
                          });
                newMessages = [finalMessage];
            }

            const durationMs = Date.now() - startTime;

            // 提取 Token 消耗統計
            const usageMetadata = finalMessage.usage_metadata;
            const usageDelta: UsageStats = { promptTokens: 0, completionTokens: 0, durationMs };

            if (usageMetadata) {
                usageDelta.promptTokens = usageMetadata.input_tokens ?? 0;
                usageDelta.completionTokens = usageMetadata.output_tokens ?? 0;
            } else {
                const tokenUsage = (finalMessage.additional_kwargs as any)?.tokenUsage;
                if (tokenUsage) {
                    usageDelta.promptTokens = tokenUsage.promptTokens ?? 0;
                    usageDelta.completionTokens = tokenUsage.completionTokens ?? 0;
                }
            }

            // 累加資源消耗統計
            this.usageStats.promptTokens += usageDelta.promptTokens;
            this.usageStats.completionTokens += usageDelta.completionTokens;
            this.usageStats.durationMs += usageDelta.durationMs;

            // 將新產生的 LangChain 訊息映射為 SuperNova 的 DataBlock 陣列
            const newBlocks: DataBlock[] = [];
            const toolCallMap = new Map<string, any>();

            // 預先建立 tool_calls 對照表
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

            // 依序封裝新訊息為 DataBlock
            for (const m of newMessages) {
                if (m.type === 'ai') {
                    const aiMsg = m as AIMessage;
                    if (Array.isArray(aiMsg.content)) {
                        for (const cb of aiMsg.content) {
                            let content = '';
                            if (cb.type === 'text') content = `${cb.text}`;
                            else if (cb.type === 'reasoning') content = `${cb.reasoning}`;

                            if (content.trim()) {
                                newBlocks.push(
                                    new DataBlock({
                                        sessionId: this.sessionId || 'default',
                                        senderId,
                                        targetId,
                                        type: 'ai',
                                        intent: 'AGENT_REPLY',
                                        controlPayload: content,
                                    })
                                );
                            }
                        }
                    } else if (typeof aiMsg.content === 'string' && aiMsg.content.trim() !== '') {
                        newBlocks.push(
                            new DataBlock({
                                sessionId: this.sessionId || 'default',
                                senderId,
                                targetId,
                                type: 'ai',
                                intent: 'AGENT_REPLY',
                                controlPayload: aiMsg.content,
                            })
                        );
                    }
                } else if (m.type === 'tool') {
                    const toolMsg = m as ToolMessage;
                    const args = toolCallMap.get(toolMsg.tool_call_id) || {};
                    newBlocks.push(
                        new DataBlock({
                            sessionId: this.sessionId || 'default',
                            senderId,
                            targetId,
                            type: 'tool',
                            intent: 'TOOL_CALL',
                            controlPayload: {
                                toolName: toolMsg.name || 'unknown',
                                args,
                                result: toolMsg.content,
                            },
                        })
                    );
                }
            }

            // 兜底保護：若無任何 block 產生，以 finalMessage 補足
            if (newBlocks.length === 0 && finalMessage) {
                const content =
                    typeof finalMessage.content === 'string'
                        ? finalMessage.content
                        : JSON.stringify(finalMessage.content);
                newBlocks.push(
                    new DataBlock({
                        sessionId: this.sessionId || 'default',
                        senderId,
                        targetId,
                        type: 'ai',
                        intent: 'AGENT_REPLY',
                        controlPayload: content || '(empty)',
                    })
                );
            }

            return { newBlocks, usageDelta, finalMessage };
        } catch (error: any) {
            this.logger.error(`LLM call failed in agent [${this.id}]: ${error.message}`);
            throw error;
        }
    }

    // ─── 執行管線 (ReAct Loop) ───

    /**
     * 執行完整對話與推論決策週期 (Run)
     * 切面順序：BeforeAgentRun -> 收集器官 Prompt 與 Tools -> onBeforeRun -> callModel -> onAfterRun -> AfterAgentRun -> 廣播 SessionMessage
     * @param input 使用者輸入文字或對話訊息清單
     */
    public async run(input: string | BaseMessage[]): Promise<AIMessage> {
        if (this._state === AgentState.STOPPED) {
            throw new Error(`Cannot run agent [${this.id}]: Agent is STOPPED`);
        }

        this.setState(AgentState.BUSY);

        try {
            const initialMessages: BaseMessage[] =
                typeof input === 'string' ? [new HumanMessage(input)] : [...input];

            const runContext: RunContext = {
                agentId: this.id,
                messages: initialMessages,
                tools: [],
                promptSections: [],
                metadata: {},
            };

            // 1. 廣播執行週期開始鉤子 (BeforeAgentRun)
            this.eventBus.publish({
                type: HookEvent.BeforeAgentRun,
                timestamp: Date.now(),
                payload: { agentId: this.id },
            });

            // 2. 收集所有器官模組提供的 Prompt 區塊與可用工具
            const collectedSections: IPromptSection[] = [];
            const collectedTools: any[] = [];

            for (const mod of this.sortedModules) {
                if (typeof mod.getPromptSections === 'function') {
                    const sections = await mod.getPromptSections();
                    if (Array.isArray(sections)) {
                        collectedSections.push(...sections);
                    }
                }
                if (typeof mod.getTools === 'function') {
                    const tools = await mod.getTools();
                    if (Array.isArray(tools)) {
                        collectedTools.push(...tools);
                    }
                }
            }

            // 按 index 升冪排序段落 (數字小在前)
            collectedSections.sort((a, b) => Number(a.index) - Number(b.index));
            runContext.promptSections = collectedSections;
            runContext.tools = collectedTools;

            // 3. 依優先級執行模組的 onBeforeRun (相容 onBeforeStep)
            for (const mod of this.sortedModules) {
                if (typeof mod.onBeforeRun === 'function') {
                    await mod.onBeforeRun(runContext);
                } else if (typeof (mod as any).onBeforeStep === 'function') {
                    await (mod as any).onBeforeStep(runContext);
                }
            }

            // 4. 組裝完整 Prompt：系統提示 (由各模組提供之 Sections 聚合) + 對話訊息
            const promptContent = runContext.promptSections.map((s) => s.content).join('\n\n');
            const messagesToSend: BaseMessage[] = [];
            if (promptContent.trim().length > 0) {
                messagesToSend.push(new SystemMessage(promptContent));
            }
            messagesToSend.push(...runContext.messages);

            // 5. 調用 callModel (若有裝配工具則自動透過 ReactAgent 執行迴圈)
            const { newBlocks, usageDelta, finalMessage } = await this.callModel(messagesToSend, {
                overrideTools: runContext.tools,
                presetName: this.presetName,
            });

            runContext.modelResponse = finalMessage;
            runContext.output = finalMessage.content;
            runContext.metadata.newBlocks = newBlocks;
            runContext.metadata.usageDelta = usageDelta;

            // 6. 依優先級執行模組的 onAfterRun (相容 onAfterStep)
            for (const mod of this.sortedModules) {
                if (typeof mod.onAfterRun === 'function') {
                    await mod.onAfterRun(runContext);
                } else if (typeof (mod as any).onAfterStep === 'function') {
                    await (mod as any).onAfterStep(runContext);
                }
            }

            // 7. 廣播執行週期完成鉤子 (AfterAgentRun)
            this.eventBus.publish({
                type: HookEvent.AfterAgentRun,
                timestamp: Date.now(),
                payload: { agentId: this.id },
            });

            // 8. 廣播統一會話訊息事件 (SessionMessage)：以 SessionMessageType.AgentSend 發佈代理產出陣列
            this.eventBus.publish({
                type: SessionEvent.SessionMessage,
                timestamp: Date.now(),
                sessionId: this.sessionId || 'default',
                payload: {
                    sessionId: this.sessionId || 'default',
                    senderId: this.id,
                    targetId: null,
                    type: SessionMessageType.AgentSend,
                    intent: 'AGENT_RESPONSE',
                    message: newBlocks,
                },
            });

            return finalMessage;
        } catch (error: any) {
            const errMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error during agent [${this.id}] run: ${errMsg}`);

            this.eventBus.publish({
                type: HookEvent.OnAgentError,
                timestamp: Date.now(),
                payload: { agentId: this.id, error: errMsg },
            });

            throw error;
        } finally {
            // @ts-ignore
            if (this._state !== AgentState.STOPPED) {
                this.setState(AgentState.IDLE);
            }
        }
    }

    // ─── 私有輔助邏輯 ───

    /**
     * 生成工具簽名字串，用於 ReactAgent 快取定位
     */
    private generateToolsSignature(tools: any[]): string {
        return tools
            .map((t) => (typeof t.name === 'string' ? t.name : t.constructor?.name || 'unknown'))
            .sort()
            .join(',');
    }

    /**
     * 將各類自定義工具標準化為 LangChain 相容之 Tool 實例，並注入 EventBus 切面監控
     */
    private normalizeTools(tools: any[]): any[] {
        return tools.map((rawTool) => {
            const toolName = rawTool.name || rawTool.constructor?.name || 'anonymous_tool';
            const description = rawTool.description || `Tool: ${toolName}`;

            // 若已有 toLangChainTool 則優先取得基礎結構
            const baseLcTool =
                typeof rawTool.toLangChainTool === 'function'
                    ? rawTool.toLangChainTool({
                          sessionId: this.sessionId || 'default',
                          agentId: this.id,
                          eventBus: this.eventBus,
                          config: this.config,
                      })
                    : rawTool;

            const schema =
                baseLcTool.schema ??
                rawTool.schema ??
                z.object({}).passthrough();

            // 封裝為帶有 EventBus 監控切面的 DynamicStructuredTool
            return new DynamicStructuredTool({
                name: toolName,
                description,
                schema,
                func: async (args: any) => {
                    // 1. 廣播工具執行前鉤子 (BeforeToolCall)
                    this.eventBus.publish({
                        type: HookEvent.BeforeToolCall,
                        timestamp: Date.now(),
                        payload: { toolName, args },
                    });

                    try {
                        let result: any;
                        if (typeof baseLcTool.func === 'function') {
                            result = await baseLcTool.func(args);
                        } else if (typeof rawTool.invoke === 'function') {
                            result = await rawTool.invoke(args);
                        } else if (typeof rawTool.execute === 'function') {
                            result = await rawTool.execute(args, {
                                sessionId: this.sessionId || 'default',
                                agentId: this.id,
                                eventBus: this.eventBus,
                                config: this.config,
                            });
                        } else {
                            result = 'Tool executed successfully';
                        }

                        // 2. 廣播工具執行後鉤子 (AfterToolCall)
                        this.eventBus.publish({
                            type: HookEvent.AfterToolCall,
                            timestamp: Date.now(),
                            payload: { toolName, args, result },
                        });

                        return typeof result === 'string' ? result : JSON.stringify(result);
                    } catch (error: any) {
                        const errMsg = error instanceof Error ? error.message : String(error);

                        // 3. 廣播工具執行失敗鉤子 (OnToolError)
                        this.eventBus.publish({
                            type: HookEvent.OnToolError,
                            timestamp: Date.now(),
                            payload: { toolName, args, error: errMsg },
                        });

                        // 回傳錯誤字串給模型，讓模型在下一輪針對錯誤進行調整
                        return `Tool Error: ${errMsg}`;
                    }
                },
            });
        });
    }

    /**
     * 重建模組快取列表，依照 priority 升冪排序 (優先級數值小者先執行)
     */
    private rebuildSortedModules(): void {
        this.sortedModules = Array.from(this.modules.values()).sort(
            (a, b) => (a.priority ?? 50) - (b.priority ?? 50)
        );
    }

    /**
     * 更新並廣播狀態機變化
     */
    private setState(newState: AgentState): void {
        const oldState = this._state;
        if (oldState === newState) {
            return;
        }

        this._state = newState;
        this.logger.debug(`Agent [${this.id}] state: ${oldState} -> ${newState}`);

        this.eventBus.publish({
            type: AgentEvent.AgentStateChanged,
            timestamp: Date.now(),
            payload: {
                agentId: this.id,
                oldState,
                newState,
            },
        });
    }
}
