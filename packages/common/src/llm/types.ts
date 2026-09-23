import { z } from 'zod';

import { Embeddings } from '@langchain/core/embeddings';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ILifecycle } from '@supernova/runtime/lifecycle/ILifecycle';

/**
 * 深度思考與推理控制配置 Schema (ReasoningConfig)
 */
export const ReasoningSchema = z.object({
    /** 思考強度 (例如 'none', 'low', 'medium', 'high') */
    effort: z.string().optional().describe('Reasoning effort level'),
    /** 摘要模式 (例如 'auto', 'detailed') */
    summary: z.string().optional().describe('Reasoning summary mode'),
});

export type ReasoningConfig = z.infer<typeof ReasoningSchema>;

/**
 * 單一 LLM Preset 配置 Schema
 */
export const LLMPresetSchema = z.object({
    /** 提供商標識，例如 'openai' 或 'mock' */
    provider: z.string().default('openai'),
    /** 模型名稱，例如 'gpt-5.6-luna', 'gpt-4o', 'gpt-4o-mini' */
    modelName: z.string().default('gpt-4o'),
    /** 採樣溫度 */
    temperature: z.number().min(0).max(2).default(0.7),
    /** 最大生成 Token 數 */
    maxTokens: z.number().positive().optional(),
    /** API Key (可透過環境變數或覆寫提供) */
    apiKey: z.string().optional(),
    /** 深度思考與推理模式設定 */
    reasoning: ReasoningSchema.optional(),
    /** 是否啟用並行工具調用 */
    parallel_tool_calls: z.boolean().optional(),
    /** 服務等級 (例如 'flex', 'default') */
    service_tier: z.string().optional(),
    /** 額外的端點或 SDK 配置 */
    configuration: z.record(z.string(), z.any()).optional(),
});

export type LLMPresetConfig = z.infer<typeof LLMPresetSchema>;

/**
 * 全局 LLM 模組配置區塊 Schema
 */
export const LLMSectionSchema = z.object({
    /** 預設使用的 Preset 名稱 */
    default_preset: z.string().default('default'),
    /** 預設向量模型名稱 */
    embedding_model: z.string().default('text-embedding-3-small'),
    /** 向量模型提供商標識 */
    embedding_provider: z.string().default('openai'),
    /** 所有已定義的 Presets 清單 */
    presets: z.record(z.string(), LLMPresetSchema).default({
        default: {
            provider: 'openai',
            modelName: 'gpt-4o',
            temperature: 0.7,
        },
    }),
});

export type LLMSectionConfig = z.infer<typeof LLMSectionSchema>;

/**
 * 模型工廠函式型別
 */
export type ModelFactory = (config: LLMPresetConfig) => BaseChatModel;

/**
 * 向量工廠函式型別
 */
export type EmbeddingsFactory = (modelName: string, apiKey?: string, extra?: Record<string, any>) => Embeddings;

/**
 * LLM 提供者介面
 * 負責快取、生命週期管理與依 Preset 產生 LangChain 實例
 */
export interface ILLMProvider extends ILifecycle {
    /**
     * 獲取指定 Preset 的 LangChain ChatModel 實例
     * @param presetName Preset 名稱，若未指定則使用 default_preset
     */
    getModel(presetName?: string): BaseChatModel;

    /**
     * 獲取 Embeddings 向量嵌入模型實例
     */
    getEmbeddings(): Embeddings;

    /**
     * 動態註冊第三方或客製模型工廠
     * @param providerName 提供商名稱 (如 'ollama', 'anthropic', 'custom')
     * @param factory 建立 BaseChatModel 的工廠函式
     */
    registerModelFactory(providerName: string, factory: ModelFactory): void;

    /**
     * 動態註冊向量模型工廠
     * @param providerName 提供商名稱
     * @param factory 建立 Embeddings 的工廠函式
     */
    registerEmbeddingsFactory(providerName: string, factory: EmbeddingsFactory): void;
}
