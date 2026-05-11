/**
 * Agent 定義 Schema
 * 用於描述 Agent 的初始化配置。
 */
export type AgentDefinitionSchema = {
  /** Agent 唯一識別碼 */
  id: string;
  /** Agent 的角色定義 */
  role: string;
  /** Agent 具備的能力標籤 */
  capabilities: string[];
  /** 額外的元數據配置 */
  metadata?: Record<string, any>;
}
