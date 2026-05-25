import { z } from 'zod';

import { RecordAction, recorder } from '../infra/LogManager';
import { IAgentExecuteContext } from '../infra/types/agent';

/**
 * 工具安全等級 (Safety Tier)
 * 用於定義工具執行的風險評估與權限要求。
 */
export type ToolSafetyTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

/**
 * 原子化工具接口
 * 定義了一個可被 Agent 調用的原子操作。
 */
export interface ITool<TIn = any, TOut = any> {
  /** 工具名稱 */
  name: string;
  
  /** 工具功能描述 */
  description: string;

  /** 
   * 安全風險評級
   * TIER_1: 唯讀 (Read-Only)
   * TIER_2: 有副作用 (Side-Effect)
   * TIER_3: 具破壞性 (Destructive)
   */
  safety_tier: ToolSafetyTier;

  /** 輸入驗證 Schema (Zod) */
  schema: z.ZodType<TIn>;
  
  /** 
   * 工具輸入預檢
   * 在正式執行前，對輸入參數進行 Schema 驗證與邏輯檢查。
   * @param input 待檢查的輸入參數
   */
  validateInput(input: TIn): Promise<boolean>;

  /** 
   * 執行工具的核心邏輯
   * @param input 工具輸入數據
   * @param context 執行上下文 (包含 sessionId, agentId 等)
   */
  run(input: TIn, context: IAgentExecuteContext): Promise<TOut>;
  
  /** 執行此工具所需的最小能力標籤 */
  required_capabilities: string[];
}

/**
 * BaseTool 抽象基類
 * 實作 ITool 接口，為所有工具提供基礎架構。
 * 在 SuperNova 2.0 中，BaseTool 會自動記錄執行的主動操作與結果。
 */
export abstract class BaseTool<TIn = any, TOut = any> implements ITool<TIn, TOut> {
  /**
   * @param name 工具名稱
   * @param description 工具功能描述
   * @param safety_tier 安全風險評級
   * @param required_capabilities 執行此工具所需的最小能力標籤
   * @param schema 輸入驗證 Schema
   */
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly safety_tier: ToolSafetyTier,
    public readonly required_capabilities: string[] = [],
    public readonly schema: z.ZodType<TIn> = z.any() as any
  ) {}

  /**
   * 默認輸入驗證邏輯
   * 在正式執行前，對輸入參數進行 Schema 驗證與邏輯檢查。
   * @param input 待檢查的輸入參數
   */
  async validateInput(input: TIn): Promise<boolean> {
    if (this.schema) {
      const result = await this.schema.safeParseAsync(input);
      return result.success;
    }
    return true;
  }

  /**
   * 工具執行的對外統一入口
   * 封裝了驗證與自動紀錄 (Record) 邏輯。
   */
  async execute(input: TIn, context: IAgentExecuteContext): Promise<TOut> {
    // 1. 記錄主動動作開始
    recorder.record(RecordAction.TOOL_CALL, `Tool [${this.name}] invoked by Agent [${context.agentId}]`, {
      session_id: context.sessionId,
      trace_id: context.traceId,
      agent_id: context.agentId,
      payload: { input }
    });

    // 2. 驗證輸入
    const isValid = await this.validateInput(input);
    if (!isValid) {
      const errorMsg = `Invalid input for tool: ${this.name}`;
      recorder.error(errorMsg, { 
        session_id: context.sessionId, 
        trace_id: context.traceId, 
        payload: { input } 
      });
      throw new Error(errorMsg);
    }

    try {
      // 3. 執行核心邏輯
      const result = await this.run(input, context);

      // 4. 記錄動作結果
      recorder.record(RecordAction.STATE_MUTATION, `Tool [${this.name}] execution finished`, {
        session_id: context.sessionId,
        trace_id: context.traceId,
        agent_id: context.agentId,
        payload: { result }
      });

      return result;
    } catch (error: any) {
      // 記錄失敗
      recorder.error(`Tool [${this.name}] failed: ${error.message}`, {
        session_id: context.sessionId,
        trace_id: context.traceId,
        payload: { error }
      });
      throw error;
    }
  }

  /**
   * 執行工具的核心邏輯 (由子類實作)
   * @param input 工具輸入數據
   * @param context 執行上下文
   */
  abstract run(input: TIn, context: IAgentExecuteContext): Promise<TOut>;
}
