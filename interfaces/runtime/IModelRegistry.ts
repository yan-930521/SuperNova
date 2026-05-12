import { z } from 'zod';

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
  /** 額外的模板變量，用於 LangChain 渲染 */
  variables?: Record<string, any>;
}

import { IAgentState } from '../agent/IAgentState';

/**
 * 推理引擎接口
 */
export interface IInferenceEngine {
  /**
   * 執行感知狀態的結構化推理
   * 並自動將此次交互記錄至 state.messages 中。
   * @param prompt 基礎指令
   * @param state 當前 Agent 狀態
   * @param schema Zod 驗證架構
   */
  infer<T>(prompt: string, state: IAgentState, schema: z.ZodSchema<T>, options?: InferenceOptions): Promise<T>;
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
   * 註冊一個新的模型引擎
   */
  registerModel(preset: ModelPreset, engine: IInferenceEngine): void;
}
