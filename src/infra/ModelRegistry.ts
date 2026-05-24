import { z } from 'zod';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { AgentState } from '../models/AgentState';
import { recorder } from '../infra/LogManager';

/**
 * 模型用途預設
 */
export enum ModelPreset {
  /** 快速生成，適用於簡單的思維分支 */
  FAST = 'fast',
  /** 高智能，適用於複雜規劃與拆解 */
  SMART = 'smart',
  /** 嚴謹，專門用於評價與審核 */
  EVAL = 'eval'
}

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
 * 採用 Stateless 設計，內部維護 ChatPromptTemplate。
 */
export class InferenceEngine {
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
  withSystemPrompt(prompt: string): InferenceEngine {
    const newEngine = new InferenceEngine(this.modelInstance);
    // 建立標準的 LangGraph 風格模板：System Prompt + Messages 佔位符
    newEngine._promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", prompt],
      new MessagesPlaceholder("messages"),
    ]);
    return newEngine;
  }

  /**
   * 執行感知狀態的結構化推理。
   * 此方法為純粹的呼叫，不維護或修改外部狀態 (如 state.messages)。
   */
  async infer<T>(state: AgentState, schema: z.ZodSchema<T>, options?: InferenceOptions): Promise<T> {
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
      recorder.error(`[InferenceEngine] Inference failed: ${error.message}`, { type: 'SYSTEM' });
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
}
