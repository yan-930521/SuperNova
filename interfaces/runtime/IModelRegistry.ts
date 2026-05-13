import { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

import { IAgentState } from '../agent/IAgentState';

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
 * 推理引擎接口
 */
export interface IInferenceEngine {
  /** 內部維護的提示詞模板 */
  readonly promptTemplate: ChatPromptTemplate | null;

  /**
   * 綁定系統提示詞，回傳一個預設了 ChatPromptTemplate 的引擎實例。
   * 這允許引擎實例維護特定 Prompt 而不需每次讀取。
   * @param prompt 系統提示詞模板或內容
   */
  withSystemPrompt(prompt: string): IInferenceEngine;

  /**
   * 執行感知狀態的結構化推理。
   * 此方法為純粹的呼叫，不維護或修改外部狀態 (如 state.messages)。
   * @param state 當前 Agent 狀態 (作為唯讀數據源)
   * @param schema Zod 驗證架構
   * @param options 執行選項
   */
  infer<T>(state: IAgentState, schema: z.ZodSchema<T>, options?: InferenceOptions): Promise<T>;
}

/**
 * 模型註冊表接口
 */
export interface IModelRegistry {
  /**
   * 獲取指定預設的模型引擎
   * @param preset 預設類型
   */
  getModel(preset: ModelPreset): IInferenceEngine;

  /**
   * 獲取原始的 LangChain 聊天模型實例 (用於 LangGraph 整合)
   * @param preset 預設類型
   */
  getRawModel(preset: ModelPreset): any;
  
  /**
   * 註冊一個新的模型引擎
   */
  registerModel(preset: ModelPreset, engine: IInferenceEngine): void;
}
