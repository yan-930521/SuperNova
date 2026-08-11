import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

import { Config } from '../../config/Config';
import { ILifecycle } from '../../lifecycle/ILifecycle';
import { LogManager } from '../LogManager';
import { ConsoleTransport } from '../transports';

/**
 * 集中管理與快取 LangChain LLM 實例的提供者
 */
export class LLMProvider implements ILifecycle {
    private llmInstances = new Map<string, BaseChatModel>();
    private embeddingsInstance?: OpenAIEmbeddings;
    private config: Config;

    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'LLMProvider' }).addTransport(new ConsoleTransport('DEBUG'));

    constructor(config: Config) {
        this.config = config;
    }

    public async initialize(): Promise<void> {
        this.logger.info('Initializing LLM Provider...');
        // 可以在這裡預先載入 default preset
        this.getModel(this.config.llm.default_preset);

        // 初始化向量模型 (讀取 Config)
        this.embeddingsInstance = new OpenAIEmbeddings({
            modelName: this.config.llm.embedding_model,
        });
    }

    public async stop(): Promise<void> {
        this.logger.info('Shutting down LLM Provider, clearing instances...');
        this.llmInstances.clear();
        this.embeddingsInstance = undefined;
    }

    /**
     * 獲取對應 preset 的 LangChain Chat Model 實例 (自動實例化並快取)
     */
    public getModel(presetName?: string): BaseChatModel {
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
     * 呼叫 OpenAI API 產生向量 (Embeddings)
     * 用於將字串轉為高維度向量陣列，以供 MemoryManager 計算 Cosine Similarity
     * @param text 要向量化的目標文本
     * @returns 浮點數向量陣列
     */
    public async generateEmbeddings(text: string): Promise<number[]> {
        if (!this.embeddingsInstance) {
            throw new Error("Embeddings instance not initialized.");
        }
        try {
            return await this.embeddingsInstance.embedQuery(text);
        } catch (error) {
            this.logger.error('Failed to generate embeddings', { payload: { text, error } });
            throw error;
        }
    }
}
