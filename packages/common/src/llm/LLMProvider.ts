import { Embeddings } from '@langchain/core/embeddings';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';

import { IConfigManager } from '../config/types';
import { MockChatModel } from './MockChatModel';
import { MockEmbeddings } from './MockEmbeddings';
import {
    EmbeddingsFactory, ILLMProvider, LLMPresetConfig, LLMSectionConfig, LLMSectionSchema,
    ModelFactory
} from './types';

/**
 * 集中管理與快取 LangChain LLM / Embeddings 實例的提供者
 * 遵循極簡與模組化架構，生命週期託管於 Kernel
 */
export class LLMProvider implements ILLMProvider {
    private readonly configManager: IConfigManager;
    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'LLMProvider' }).addTransport(
        new ConsoleTransport('DEBUG')
    );

    /** 快取的聊天模型實例對照表 (presetName -> BaseChatModel) */
    private readonly modelInstances = new Map<string, BaseChatModel>();

    /** 快取的向量模型實例 */
    private embeddingsInstance?: Embeddings;

    /** 自訂聊天模型工廠函式註冊表 */
    private readonly customModelFactories = new Map<string, ModelFactory>();

    /** 自訂向量模型工廠函式註冊表 */
    private readonly customEmbeddingsFactories = new Map<string, EmbeddingsFactory>();

    /** 是否已經初始化完成 */
    private isInitialized = false;

    constructor(configManager: IConfigManager) {
        this.configManager = configManager;

        // 若尚未註冊 llm 區塊，則註冊預設配置定義
        if (!this.configManager.hasSection('llm')) {
            this.configManager.registerSection('llm', LLMSectionSchema, {
                default_preset: 'default',
                embedding_model: 'text-embedding-3-small',
                embedding_provider: 'openai',
                presets: {
                    default: {
                        provider: 'openai',
                        modelName: 'gpt-4o',
                        temperature: 0.7,
                    },
                },
            });
        }
    }

    /**
     * 初始化 LLM 提供者，驗證基本配置可用性
     */
    public async initialize(): Promise<void> {
        this.logger.info('Initializing LLMProvider...');
        const config = this.getLLMConfig();

        // 檢查預設 preset 是否在清單中
        if (!config.presets[config.default_preset]) {
            const errorMsg = `Default preset [${config.default_preset}] is not configured in presets`;
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        this.isInitialized = true;
        this.logger.info(`LLMProvider initialized. Default preset is [${config.default_preset}]`);
    }

    /**
     * 啟動提供者
     */
    public async start(): Promise<void> {
        this.logger.info('Starting LLMProvider...');
    }

    /**
     * 停止提供者，優雅釋放快取的連線與模型實例
     */
    public async stop(): Promise<void> {
        this.logger.info('Stopping LLMProvider, clearing cached instances...');
        this.modelInstances.clear();
        this.embeddingsInstance = undefined;
        this.isInitialized = false;
        this.logger.info('LLMProvider successfully stopped.');
    }

    /**
     * 獲取指定 Preset 的 LangChain ChatModel 實例 (具快取機制)
     * @param presetName Preset 名稱，預設使用 default_preset
     */
    public getModel(presetName?: string): BaseChatModel {
        const config = this.getLLMConfig();
        const finalPresetName = presetName ?? config.default_preset;

        // 若已建立實例，直接從記憶體快取回傳
        if (this.modelInstances.has(finalPresetName)) {
            return this.modelInstances.get(finalPresetName)!;
        }

        // 檢查 Preset 是否存在
        const presetConfig = config.presets[finalPresetName];
        if (!presetConfig) {
            const errorMsg = `LLM preset [${finalPresetName}] is not found in configuration`;
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        // 根據 provider 建立實例
        const model = this.createModelInstance(presetConfig);
        this.modelInstances.set(finalPresetName, model);

        this.logger.debug(`Cached new BaseChatModel instance for preset [${finalPresetName}]`);
        return model;
    }

    /**
     * 獲取 Embeddings 向量實例
     */
    public getEmbeddings(): Embeddings {
        if (this.embeddingsInstance) {
            return this.embeddingsInstance;
        }

        const config = this.getLLMConfig();
        const provider = config.embedding_provider.toLowerCase();

        // 檢查是否有自訂向量工廠
        if (this.customEmbeddingsFactories.has(provider)) {
            const factory = this.customEmbeddingsFactories.get(provider)!;
            this.embeddingsInstance = factory(config.embedding_model);
            return this.embeddingsInstance;
        }

        // 內建提供者處理
        if (provider === 'mock') {
            this.embeddingsInstance = new MockEmbeddings();
            return this.embeddingsInstance;
        }

        if (provider === 'openai') {
            const apiKey = process.env.OPENAI_API_KEY;
            this.embeddingsInstance = new OpenAIEmbeddings({
                modelName: config.embedding_model,
                apiKey,
            });
            return this.embeddingsInstance;
        }

        const errorMsg = `Unsupported embeddings provider [${provider}]`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
    }

    /**
     * 動態註冊模型工廠
     */
    public registerModelFactory(providerName: string, factory: ModelFactory): void {
        this.customModelFactories.set(providerName.toLowerCase(), factory);
        this.logger.info(`Custom model factory registered for provider [${providerName}]`);
    }

    /**
     * 動態註冊向量模型工廠
     */
    public registerEmbeddingsFactory(providerName: string, factory: EmbeddingsFactory): void {
        this.customEmbeddingsFactories.set(providerName.toLowerCase(), factory);
        this.logger.info(`Custom embeddings factory registered for provider [${providerName}]`);
    }

    /**
     * 依據 Preset 配置建立實例
     */
    private createModelInstance(presetConfig: LLMPresetConfig): BaseChatModel {
        const provider = presetConfig.provider.toLowerCase();

        // 1. 自訂工廠優先
        if (this.customModelFactories.has(provider)) {
            const factory = this.customModelFactories.get(provider)!;
            return factory(presetConfig);
        }

        // 2. Mock 測試模型
        if (provider === 'mock') {
            return new MockChatModel();
        }

        // 3. OpenAI 官方提供者
        if (provider === 'openai') {
            const apiKey = presetConfig.apiKey ?? process.env.OPENAI_API_KEY;
            return new ChatOpenAI({
                modelName: presetConfig.modelName,
                temperature: presetConfig.temperature,
                maxTokens: presetConfig.maxTokens,
                apiKey,
                configuration: presetConfig.configuration,
                ...(presetConfig.reasoning ? { reasoning: presetConfig.reasoning } : {}),
                ...(presetConfig.parallel_tool_calls !== undefined
                    ? { parallel_tool_calls: presetConfig.parallel_tool_calls }
                    : {}),
                ...(presetConfig.service_tier ? { service_tier: presetConfig.service_tier } : {}),
            } as any);
        }

        const errorMsg = `Unsupported LLM provider [${provider}] for model [${presetConfig.modelName}]`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
    }

    /**
     * 從 ConfigManager 獲取 LLM 區塊配置
     */
    private getLLMConfig(): LLMSectionConfig {
        return this.configManager.get<LLMSectionConfig>('llm');
    }
}
