import type { IMutationRequest } from '../models/IMutationRequest';

/**
 * 基礎 Agent 接口
 * 定義了 SuperNova 體系中所有智能體的最小行為準則。
 */
export interface IAgent {
  /** Agent 唯一識別碼 */
  id: string;
  /** Agent 的角色名稱 */
  role: string;
  /** Agent 的身分描述文本 (Prompt) */
  identity: string;
  /** Agent 具備的能力標籤 */
  readonly capabilities: string[];

  /** 
   * 接收並處理分派的任務 
   * @param task 任務數據對象
   */
  receiveTask(task: any): Promise<void>;

  /** 
   * 向系統提議一項規則變更 (Mutation)
   * @param mutation 變更請求對象
   */
  proposeMutation(mutation: IMutationRequest): Promise<void>;
  
  /** 
   * 將 Agent 當前狀態序列化為 JSON 
   */
  toJSON(): Record<string, any>;

  /** 
   * 從 JSON 配置初始化或恢復 Agent 狀態 
   * @param config 符合 AgentDefinitionSchema 的配置對象
   */
  initFromJSON(config: Record<string, any>): Promise<void>;
}
