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
  
  /** 
   * 工具輸入預檢
   * 在正式執行前，對輸入參數進行 Schema 驗證與邏輯檢查。
   * @param input 待檢查的輸入參數
   */
  validateInput(input: TIn): Promise<boolean>;

  /** 
   * 執行工具的核心邏輯
   * 建議在 Guardian 防護下執行，以提供隔離與穩定性。
   * @param input 工具輸入數據
   */
  run(input: TIn): Promise<TOut>;
  
  /** 執行此工具所需的最小能力標籤 */
  required_capabilities: string[];
}
