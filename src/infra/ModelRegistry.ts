import { z } from 'zod';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
    ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate
} from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';

import { AgentState } from '../domain/agent/AgentState';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import { recorder } from './LogManager';
import { ModelPreset } from './types/agent';

/**
 * 模型執行選項
 */
export interface InferenceOptions {
	temperature?: number;
	maxTokens?: number;
	stopSequences?: string[];
	/** 額外的模板變量，用於渲染提示詞 */
	variables?: Record<string, any>;
}

/**
 * 推理引擎實例
 * 採用 Stateless 設計，負責協調模型調用與結構化輸出。
 */
export class InferenceEngine {
	/**
	 * @param modelInstance 支援 withStructuredOutput 的 LangChain 聊天模型
	 * @param systemPrompt 選擇性的系統提示詞模板
	 */
	constructor(
		public readonly modelInstance: BaseChatModel,
		private readonly systemPrompt?: string
	) { }

	/**
	 * 綁定系統提示詞，回傳一個新的引擎實例。
	 * 此操作為純粹的屬性賦值，延遲到執行時才構建模板。
	 */
	withSystemPrompt(prompt: string): InferenceEngine {
		return new InferenceEngine(this.modelInstance, prompt);
	}

	/**
	 * 執行感知狀態的結構化推理。
	 * 此方法會構建提示詞模板，並結合執行選項與推理鏈。
	 */
	async infer<T>(state: AgentState, schema: z.ZodSchema<T>, options?: InferenceOptions): Promise<T> {
		try {
			// 1. 構建提示詞模板
			// 優先級：實例綁定的 systemPrompt > 狀態元數據中的 identity > 預設提示詞
			const system = this.systemPrompt ||
				(state.metadata?.identity as string) ||
				"You are a helpful AI assistant. Goal: {goal}";

			// 使用 SystemMessagePromptTemplate.fromTemplate 確保完整的模板替換能力
			const template = ChatPromptTemplate.fromMessages([
				SystemMessagePromptTemplate.fromTemplate(system),
				new MessagesPlaceholder("messages"),
			]);

			// 2. 構建具備結構化輸出的基礎鏈
			const baseChain = template.pipe(
				this.modelInstance.withStructuredOutput(schema as any) as any
			);

			// 3. 配置執行選項 (使用顯式的 .withConfig 鏈式呼叫)
			const config = {
				runName: options?.variables?.runName || `Inference_${state.currentTask || 'Chat'}`,
				tags: options?.variables?.tags || ['supernova', GlobalRuntime.getInstance().config.version],
				configurable: {
					...options?.variables?.configurable
				}
			};

			const finalChain = baseChain.withConfig(config);

			// 4. 準備輸入變量
			const inputVariables = {
				goal: state.goal || "No specific goal",
				description: state.description || "",
				currentTask: state.currentTask || "General conversation",
				...state,
				...options?.variables,
				messages: state.messages || []
			};
			
			recorder.info(`[InferenceEngine] Invoking configured inference chain: ${config.runName}`, { type: 'SYSTEM' });

			// 5. 執行並回傳結果
			const result = await finalChain.invoke(inputVariables) as T;
			recorder.info(`[InferenceEngine] Inference completed: ${config.runName}`, { type: 'SYSTEM' });
			return result;

		} catch (error: any) {
			recorder.error(`[InferenceEngine] Inference execution failed`, {
				type: 'SYSTEM',
				payload: {
					error: error.message,
					task: state.currentTask
				}
			});
			throw error;
		}
	}
}

/**
 * 模型註冊表
 * 負責管理不同預設的模型引擎。
 */
export class ModelRegistry {
	private engines: Map<ModelPreset, InferenceEngine> = new Map();

	/**
	 * 獲取指定預設的模型引擎
	 */
	getModel(preset: ModelPreset): InferenceEngine {
		const engine = this.engines.get(preset);
		if (!engine) {
			throw new Error(`Model preset ${preset} not found in registry.`);
		}
		return engine;
	}

	/**
	 * 獲取原始的 LangChain 聊天模型實例 (用於 LangGraph 整合)
	 */
	getRawModel(preset: ModelPreset): BaseChatModel {
		const engine = this.engines.get(preset);
		if (!engine) {
			throw new Error(`Model preset ${preset} not found in registry.`);
		}
		return engine.modelInstance;
	}

	/**
	 * 註冊一個新的模型引擎
	 */
	registerModel(preset: ModelPreset, engine: InferenceEngine): void {
		this.engines.set(preset, engine);
	}

	/**
	 * 註冊一個新的模型引擎
	 */
	registerDefaultModels(): void {
		const realModel = new ChatOpenAI({
			modelName: "gpt-4o-mini",
			temperature: 0,
			apiKey: process.env.OPENAI_API_KEY
		});

		const inference = new InferenceEngine(realModel as any);
		this.registerModel(ModelPreset.SMART, inference);
		this.registerModel(ModelPreset.FAST, inference);
		this.registerModel(ModelPreset.EVAL, inference);
	}
}
