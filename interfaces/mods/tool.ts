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
   * 執行工具的核心邏輯
   * 建議在 Guardian 防護下執行，以提供隔離與穩定性。
   * @param input 工具輸入數據
   */
  run(input: TIn): Promise<TOut>;
  
  /** 執行此工具所需的最小能力標籤 */
  required_capabilities: string[];
}

/**
 * 工具註冊表接口
 * 負責系統中所有可用工具的發現與管理。
 */
export interface IToolRegistry {
  /** 
   * 註冊一個新工具 
   * @param tool 實現了 ITool 接口的工具實例
   */
  register(tool: ITool): void;

  /** 
   * 根據名稱獲取工具實例
   * @param name 工具的唯一名稱
   */
  getTool(name: string): ITool | undefined;

  /** 
   * 列出所有已註冊的工具
   */
  listTools(): ITool[];
}
