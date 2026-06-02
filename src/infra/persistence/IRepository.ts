import { ILifecycle } from '../../core/lifecycle/ILifecycle';

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

// --- 專屬儲存庫介面定義 ---

/**
 * 代理儲存庫介面 (Agent)
 */
export interface IAgentRepository<T extends IEntity> extends IRepository<T> {
  /**
   * 獲取系統中所有已註冊的代理配置
   */
  findAll(): Promise<T[]>;
}

/**
 * 會話儲存庫介面 (Session)
 * 支援增量訊息附加 (Append-only history)
 */
export interface ISessionRepository<T extends IEntity, M> extends IRepository<T> {
  /**
   * 僅附加一條訊息到會話歷史 (效能優化)
   * @param id 會話識別碼
   * @param message 訊息對象
   */
  appendMessage(id: string, message: M): Promise<void>;

  /**
   * 查找特定用戶的所有會話
   * @param userId 用戶識別碼
   */
  findByUser(userId: string): Promise<T[]>;
}

/**
 * 任務儲存庫介面 (Task)
 */
export interface ITaskRepository<T extends IEntity> extends IRepository<T> {
  /**
   * 查找特定會話下的所有任務
   * @param sessionId 會話識別碼
   */
  findBySession(sessionId: string): Promise<T[]>;
}

/**
 * 用戶儲存庫介面 (User/Identity)
 */
export interface IUserRepository<T extends IEntity> extends IRepository<T> {
  // 目前僅需基礎 CRUD
}

/**
 * 記憶儲存庫介面 (Memory)
 * 支援層級式命名空間檢索
 */
export interface IMemoryRepository<T extends IEntity> extends IRepository<T> {
  /**
   * 根據命名空間查找特定會話的所有記憶
   * @param namespace 命名空間
   * @param sessionId 會話識別碼
   */
  findByNamespace(namespace: string, sessionId: string): Promise<T[]>;

  /**
   * 獲取一級索引 (L1 Index)
   * @param sessionId 會話識別碼
   */
  getL1Index(sessionId: string): Promise<string[]>;
}

/**
 * 推理記錄儲存庫介面 (Inference/Log)
 * 用於持久化詳細的推理過程
 */
export interface IInferenceRepository<T extends IEntity> extends IRepository<T> {
  /**
   * 根據 Trace ID 查找推理記錄
   */
  findByTraceId(traceId: string): Promise<T | null>;
}

/**
 * 協同上下文儲存庫介面 (Blackboard/Context)
 */
export interface IContextRepository<T extends IEntity> extends IRepository<T> {
  // 基礎 CRUD 已足夠
}
