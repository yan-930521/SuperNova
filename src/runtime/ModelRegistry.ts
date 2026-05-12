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

    // 1. 自動維護 state.messages (添加 HumanMessage)
    // 注意：prompt 可能包含變量占位符，但在這裡我們記錄原始 prompt
    state.messages.push(new HumanMessage(prompt));

    try {
      // 2. 定義標準對話模板
      // 注意：prompt 已經被推入 state.messages，所以 MessagesPlaceholder 會包含它。
      // 我們不需要額外的 ["human", prompt] 欄位，除非我們想特別強調。
      // 為了避免重複，我們這裡只使用 MessagesPlaceholder。
      const promptTemplate = ChatPromptTemplate.fromMessages([
        ["system", state.metadata?.identity || "You are a helpful AI assistant. Global goal: {goal}"],
        new MessagesPlaceholder("messages"),
      ]);

      // 3. 構建並執行結構化輸出鏈
      const chain = promptTemplate.pipe(
        this.modelInstance.withStructuredOutput(schema as any) as any
      );

      // 4. 準備調度數據
      const inputVariables = {
        ...state,
        ...options?.variables,
        goal: state.goal,
        messages: state.messages
      };

      const result = await chain.invoke(inputVariables) as T;

      // 5. 添加 AIMessage 回訊息流
      state.messages.push(new AIMessage(JSON.stringify(result)));

      return result;
    } catch (error: any) {
      console.error(`[InferenceEngine] Inference failed: ${error.message}`);
      // 記錄錯誤到 state
      state.errors.push(`INFERENCE_ERROR: ${error.message}`);
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

  registerModel(preset: ModelPreset, engine: IInferenceEngine): void {
    this.engines.set(preset, engine);
  }
}
