import { ILifecycle } from '../../../core/lifecycle/ILifecycle';
import { BaseAgentData } from '../../agent/BaseAgent';
import { DataBlock } from '../../messaging/DataBlock';
// --- 專屬儲存庫介面定義 ---
import { Session } from '../../session/Session';

/**
 * 基礎實體介面，所有需持久化的對象必須具備唯一識別碼
 */
export interface IEntity {
  readonly id: string;
}

/**
 * 通用儲存庫介面 (基本 CRUD)
 * @template T 實體型別，必須繼承自 IEntity
 */
export interface IRepository<T extends IEntity> extends ILifecycle {
  /**
   * 保存或更新實體
   * @param entity 實體數據對象
   */
  save(entity: T): Promise<void>;

  /**
   * 根據 ID 載入實體
   * @param id 實體識別碼
   * @returns 實體對象，若不存在則返回 null
   */
  load(id: string): Promise<T | null>;

  /**
   * 刪除實體
   * @param id 實體識別碼
   */
  delete(id: string): Promise<void>;

  /**
   * 列出所有實體的識別碼
   */
  list(): Promise<string[]>;

  /**
   * 檢查實體是否存在
   * @param id 實體識別碼
   */
  exists(id: string): Promise<boolean>;
}

/**
 * 會話儲存庫介面
 */
export interface ISessionRepository extends IRepository<Session> {}

/**
 * 訊息與事件歷史儲存庫介面
 */
export interface IDataBlockRepository extends IRepository<DataBlock<any>> {
  /**
   * 覆寫特定 Agent 的歷史記錄
   */
  saveForAgent(sessionId: string, agentId: string, blocks: DataBlock<any>[]): Promise<void>;

  /**
   * 追加單筆 DataBlock 至特定 Agent 的歷史末尾 (JSONLine 追加)
   */
  appendForAgent(sessionId: string, agentId: string, block: DataBlock<any>): Promise<void>;

  /**
   * 讀取並還原特定 Agent 的所有 DataBlock 歷史
   */
  findByAgent(sessionId: string, agentId: string): Promise<DataBlock<any>[]>;
}



/**
 * 代理人狀態儲存庫介面
 */
export interface IAgentStateRepository extends IRepository<BaseAgentData> {
  /**
   * 保存 Agent 的狀態快照資料
   */
  saveAgentState(
    sessionId: string,
    agentId: string,
    state: BaseAgentData,
    options?: { isClone?: boolean; parentAgentId?: string }
  ): Promise<void>;

  /**
   * 讀取並還原 Agent 的狀態快照資料
   */
  loadAgentState(
    sessionId: string,
    agentId: string,
    options?: { isClone?: boolean; parentAgentId?: string }
  ): Promise<BaseAgentData | null>;
}