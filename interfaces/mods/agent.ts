import { IMutationRequest } from './models';

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

/**
 * 基礎 Agent 接口
 * 定義了 SuperNova 體系中所有智能體的最小行為準則。
 */
export interface IAgent {
  /** Agent 唯一識別碼 */
  id: string;
  /** Agent 的角色名稱 */
  role: string;

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

/**
 * 協調者 Agent 接口 (Coordinator)
 * 繼承自 IAgent，具備多 Agent 衝突裁決與任務規劃能力。
 */
export interface ICoordinator extends IAgent {
  /** 
   * 執行階層式衝突裁決，篩選出可執行的變更提議
   * @param proposals 原始變更請求列表
   */
  arbitrateMutations(proposals: IMutationRequest[]): Promise<IMutationRequest[]>;

  /** 
   * 基於目標生成任務的有向無環圖 (DAG)
   * @param goal 任務目標描述
   */
  planTaskGraph(goal: string): Promise<any>;
}

/**
 * 根級 Agent 接口 (Root Agent)
 * 繼承自 IAgent，作為系統入口負責會話的生命週期管理。
 */
export interface IRootAgent extends IAgent {
  /** 
   * 創建一個新的協作會話
   * @param goal 初始目標
   * @param config 可選的初始化配置
   */
  createSession(goal: string, config?: any): Promise<string>;

  /** 
   * 終止指定的會話並清理資源
   * @param session_id 會話 UUID
   */
  terminateSession(session_id: string): Promise<void>;
}
