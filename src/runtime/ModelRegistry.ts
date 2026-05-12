import { IModelRegistry, IInferenceEngine, ModelPreset, InferenceOptions } from '../../interfaces/runtime/IModelRegistry';
import { IAgentState } from '../../interfaces/agent/IAgentState';
import { z } from 'zod';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';

/**
 * 具體的推理引擎實現
 * 使用真實的 LangChain Runnable 管道
 */
export class InferenceEngine implements IInferenceEngine {
  /**
   * @param modelInstance 支援 withStructuredOutput 的 LangChain 聊天模型
   */
  constructor(private modelInstance: BaseChatModel) {}

  /**
   * 執行結構化推理並更新訊息流
   * 這裡採用 LangGraph 內核風格：將 prompt 視為 Template，並自動從 state 注入變量。
   */
  async infer<T>(prompt: string, state: IAgentState, schema: z.ZodSchema<T>, options?: InferenceOptions): Promise<T> {
    console.log(`[InferenceEngine] Invoking model for goal: ${state.goal}`);

    // 1. 定義標準對話模板
    // 注意：{input} 會由傳入的 prompt (template) 提供內容，但 template 本身可能還包含其他變量
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", state.metadata?.identity || "You are a helpful AI assistant. Global goal: {goal}"],
      new MessagesPlaceholder("messages"),
      ["human", prompt] // 這裡 prompt 是原始模板
    ]);

    // 2. 構建並執行結構化輸出鏈
    const chain = promptTemplate.pipe(
      this.modelInstance.withStructuredOutput(schema as any) as any
    );

    // 3. 準備調度數據
    // 合併 state 與 options.variables，讓 LangChain 自動完成 {variable} 替換
    const inputVariables = {
      ...state,
      ...options?.variables,
      goal: state.goal,
      messages: state.messages
    };

    const result = await chain.invoke(inputVariables) as T;

    // 4. 自動維護 state.messages (利用 LangGraph 的 reducer 概念)
    // 這裡我們模擬將結果添加回訊息流中
    // state.messages.push(new AIMessage({ ... })); 
    // 注意：在 LangGraph 節點中，通常由節點回傳 Partial State 來更新 messages

    return result;
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

  registerModel(preset: ModelPreset, engine: IInferenceEngine): void {
    this.engines.set(preset, engine);
  }
}
