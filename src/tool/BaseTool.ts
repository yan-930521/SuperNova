import { ITool, ToolSafetyTier } from '../../interfaces/tool/ITool';

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
   */
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly safety_tier: ToolSafetyTier,
    public readonly required_capabilities: string[] = []
  ) {}

  /**
   * 默認輸入驗證邏輯
   * 在正式執行前，對輸入參數進行 Schema 驗證與邏輯檢查。
   * 預設回傳 true，子類可以重寫此方法以實現特定的驗證邏輯。
   * @param input 待檢查的輸入參數
   */
  async validateInput(input: TIn): Promise<boolean> {
    return true;
  }

  /**
   * 執行工具的核心邏輯 (由子類實作)
   * @param input 工具輸入數據
   */
  abstract run(input: TIn): Promise<TOut>;
}
