import { z } from 'zod';

import { RecordAction, recorder } from '../infra/LogManager';
import { IAgentExecuteContext } from '../infra/types/agent';

/**
 * 工具安全等級 (Safety Tier)
 * 用於定義工具執行的風險評估與權限要求。
 */
export type ToolSafetyTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

/**
 /**
  * 工具元數據介面
  */
 export interface ToolMetadata<TIn = any> {
   /** 工具名稱 */
   name: string;
   /** 工具功能描述 */
   description: string;
   /** 工具類別 (例如 'core', 'file', 'common') */
   category: string;
   /** 
    * 安全風險評級
    * TIER_1: 唯讀 (Read-Only)
    * TIER_2: 有副作用 (Side-Effect)
    * TIER_3: 具破壞性 (Destructive)
    */
   safety_tier: ToolSafetyTier;
   /** 執行此工具所需的最小能力標籤 */
   required_capabilities?: string[];
   /** 輸入驗證 Schema (Zod) */
   schema?: z.ZodType<TIn>;
 }

 /**
  * 原子化工具接口
  * 定義了一個可被 Agent 調用的原子操作。
  */
 export interface ITool<TIn = any, TOut = any> {
   readonly name: string;
   readonly description: string;
   readonly category: string;
   readonly safety_tier: ToolSafetyTier;
   readonly required_capabilities: string[];
   readonly schema: z.ZodType<TIn>;

   /** 
    * 工具輸入預檢
    */
   validateInput(input: TIn): Promise<boolean>;

   /** 
    * 執行工具的核心邏輯
    */
   run(input: TIn, context: IAgentExecuteContext): Promise<TOut>;

   /**
    * 對外統一入口
    */
   execute(input: TIn, context: IAgentExecuteContext): Promise<TOut>;
 }

 /**
  * BaseTool 抽象基類
  */
 export abstract class BaseTool<TIn = any, TOut = any> implements ITool<TIn, TOut> {
   public readonly name: string;
   public readonly description: string;
   public readonly category: string;
   public readonly safety_tier: ToolSafetyTier;
   public readonly required_capabilities: string[];
   public readonly schema: z.ZodType<TIn>;

   constructor(metadata: ToolMetadata<TIn>) {
     this.name = metadata.name;
     this.description = metadata.description;
     this.category = metadata.category;
     this.safety_tier = metadata.safety_tier;
     this.required_capabilities = metadata.required_capabilities || [];
     this.schema = metadata.schema || (z.any() as any);
   }


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
