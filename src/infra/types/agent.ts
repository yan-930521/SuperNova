/**
 * 代理數據傳輸對象 (Agent Data Transfer Object)
 * 定義代理的靜態屬性、角色、能力以及與 LLM 對接的配置。
 */
export interface AgentDTO {
  /** 代理唯一識別碼 (例如 'researcher-01', 'coder-01') */
  id: string;
  /** 代理的角色名稱，用於任務指派邏輯 */
  role: string;
  /** 代理的身份提示詞 (System Prompt Fragment)，定義其性格與專業領域 */
  identity: string;
  /** 代理具備的能力標籤清單，對齊工具調用權限 */
  capabilities: string[];
  /** 偏好的模型預設：fast (快), smart (強), eval (評審) */
  modelPreset: 'fast' | 'smart' | 'eval';
  /** 額外的運行時配置，如 temperature, max_tokens 等 */
  config: Record<string, any>;
}

/**
 * 代理儲存庫接口
 * 負責 Agent 配置的載入與持久化。
 */
export interface IAgentRepository {
  /**
   * 根據 ID 查找代理配置
   * @param id 代理識別碼
   */
  findById(id: string): Promise<AgentDTO | null>;

  /**
   * 獲取系統中所有已註冊的代理配置
   */
  findAll(): Promise<AgentDTO[]>;

  /**
   * 保存或更新代理配置
   * @param agent 代理數據對象
   */
  save(agent: AgentDTO): Promise<void>;
}
