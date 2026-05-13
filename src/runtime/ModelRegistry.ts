import { IModelRegistry, IInferenceEngine, ModelPreset, InferenceOptions } from '../../interfaces/runtime/IModelRegistry';
import { IAgentState } from '../../interfaces/agent/IAgentState';
import { z } from 'zod';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { PromptLoader } from '../utils/PromptLoader';

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
    // 1. 渲染 Prompt 並自動維護 state.messages (添加 HumanMessage)
    const renderedPrompt = PromptLoader.render(prompt, {
      ...state,
      ...options?.variables,
      goal: state.goal
    });

    // 嘗試從 Prompt 中提取 Role 名稱 (例如 # Role\n你是一個「...」)
    const roleMatch = renderedPrompt.match(/# Role\n(?:你是一個)?(.+?)(?:\s|$)/);
    const roleName = roleMatch ? roleMatch[1].replace(/[「」]/g, '') : (state.metadata?.role || 'Assistant');
    const promptSnippet = renderedPrompt.split('\n').find(line => line.trim().length > 0 && !line.startsWith('#')) || '';
    
    // console.log(`[InferenceEngine] [${roleName}] Goal: ${state.goal.substring(0, 30)}... | ${promptSnippet.substring(0, 50)}...`);
    
    state.messages.push(new HumanMessage(renderedPrompt));

    try {
      // 2. 定義標準對話模板
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
