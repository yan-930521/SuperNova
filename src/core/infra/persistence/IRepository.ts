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
 * 通用儲存庫介面
 * @template T 實體型別，必須繼承自 IEntity
 */
export interface IRepository<T extends IEntity> extends ILifecycle {}

/**
 * 會話儲存庫介面
 */
export interface ISessionRepository extends IRepository<Session> {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | null>;
  delete(sessionId: string): Promise<void>;
  list(): Promise<string[]>;
  exists(sessionId: string): Promise<boolean>;
}

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
   * 檢查並將超大字串卸載為 DataPointer，並回傳更新後的 DataBlock。
   * 此方法保證不改變原始的 DataBlock 物件，而是回傳一個 clone 過的新物件。
   */
  offloadLargePayloads(sessionId: string, block: DataBlock<any>, thresholdBytes?: number): Promise<DataBlock<any>>;

  /**
   * 讀取並還原特定 Agent 的所有 DataBlock 歷史
   */
  findByAgent(sessionId: string, agentId: string): Promise<readonly DataBlock<any>[]>;
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
    state: BaseAgentData
  ): Promise<void>;

  /**
   * 讀取並還原 Agent 的狀態快照資料
   */
  loadAgentState(
    sessionId: string,
    agentId: string,
  ): Promise<BaseAgentData | null>;
}