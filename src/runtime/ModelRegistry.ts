import { z } from 'zod';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { IAgentState } from '../../interfaces/agent/IAgentState';
import { logger } from '../infra/LogManager';
import {
    IInferenceEngine, IModelRegistry, InferenceOptions, ModelPreset
} from '../../interfaces/runtime/IModelRegistry';

/**
 * 具體的推理引擎實現
 * 採用 Stateless 設計，內部維護 ChatPromptTemplate。
 */
export class InferenceEngine implements IInferenceEngine {
  private _promptTemplate: ChatPromptTemplate | null = null;

  /**
   * @param modelInstance 支援 withStructuredOutput 的 LangChain 聊天模型
   */
  constructor(public readonly modelInstance: BaseChatModel) {}

  get promptTemplate(): ChatPromptTemplate | null {
    return this._promptTemplate;
  }

  /**
   * 綁定系統提示詞，回傳一個新的引擎實例。
   * 建立並快取 ChatPromptTemplate。
   */
  withSystemPrompt(prompt: string): IInferenceEngine {
    const newEngine = new InferenceEngine(this.modelInstance);
    // 建立標準的 LangGraph 風格模板：System Prompt + Messages 佔位符
    newEngine._promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", prompt],
      new MessagesPlaceholder("messages"),
    ]);
    return newEngine;
  }

  /**
   * 執行結構化推理。
   * 使用 promptTemplate 進行渲染與調用。
   */
  async infer<T>(state: IAgentState, schema: z.ZodSchema<T>, options?: InferenceOptions): Promise<T> {
    try {
      // 1. 確定使用的模板
      let template = this._promptTemplate;
      if (!template) {
        // 如果沒有綁定模板，則建立臨時的預設模板
        const defaultSystem = state.metadata?.identity || "You are a helpful AI assistant. Global goal: {goal}";
        template = ChatPromptTemplate.fromMessages([
          ["system", defaultSystem],
          new MessagesPlaceholder("messages"),
        ]);
      }

      // 2. 準備輸入數據
      const inputVariables = {
        ...state,
        ...options?.variables,
        goal: state.goal,
        messages: state.messages || []
      };

      // 3. 執行結構化輸出鏈
      const chain = template.pipe(
        this.modelInstance.withStructuredOutput(schema as any) as any
      );

      const result = await chain.invoke(inputVariables) as T;

      return result;
    } catch (error: any) {
      logger.error(`[InferenceEngine] Inference failed: ${error.message}`, { type: 'SYSTEM' });
      throw error;
    }
  }
}

/**
 * 模型註冊表實現
 */
export class ModelRegistry implements IModelRegistry {
  private engines: Map<ModelPreset, IInferenceEngine> = new Map();

  getModel(preset: ModelPreset): IInferenceEngine {
    const engine = this.engines.get(preset);
    if (!engine) {
      throw new Error(`Model preset ${preset} not found in registry.`);
    }
    return engine;
  }

  getRawModel(preset: ModelPreset): BaseChatModel {
    const engine = this.engines.get(preset);
    if (!engine) {
      throw new Error(`Model preset ${preset} not found in registry.`);
    }
    // @ts-ignore - 內部已知 InferenceEngine 實作
    return (engine as InferenceEngine).modelInstance;
  }

  registerModel(preset: ModelPreset, engine: IInferenceEngine): void {
    this.engines.set(preset, engine);
  }
}
