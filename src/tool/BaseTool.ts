import { z } from 'zod';
import type { ITool, ToolSafetyTier } from '../../interfaces/tool/ITool';
import type { IToolContext } from '../../interfaces/tool/IToolContext';

/**
 * BaseTool 抽象基類
 * 實作 ITool 接口，為所有工具提供基礎架構。
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
   * 執行工具的核心邏輯 (由子類實作)
   * @param input 工具輸入數據
   * @param context 工具執行上下文
   */
  abstract run(input: TIn, context: IToolContext): Promise<TOut>;
}
