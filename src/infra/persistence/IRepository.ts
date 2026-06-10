import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { MemoryLayer } from '../types/memory';

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

import { TaskStatus } from '../types/task';

/**
 * 任務儲存庫介面 (Task)
 */
export interface ITaskRepository<T extends IEntity> extends IRepository<T> {
  /**
   * 查找特定會話下的所有任務
   * @param sessionId 會話識別碼
   */
  findBySession(sessionId: string): Promise<T[]>;

  /**
   * 查找特定會話下的根任務 (母任務)
   * @param sessionId 會話識別碼
   */
  findRootsBySession(sessionId: string): Promise<T[]>;

  /**
   * 按狀態查找任務
   * @param status 任務狀態
   */
  findTasksByStatus(status: TaskStatus): Promise<T[]>;

  /**
   * 查找所有非封存的活躍任務
   */
  findAllActiveTasks(): Promise<T[]>;
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
   * 按命名空間查找 (已棄用: 建議使用 findBySession)
   * @param namespace 命名空間 (通常為 sessionId)
   * @param sessionId 會話識別碼
   */
  findByNamespace(namespace: string, sessionId: string): Promise<T[]>;

  /**
   * 查找特定會話下的記憶
   * @param sessionId 會話識別碼
   * @param layer 記憶層級
   */
  findBySession(sessionId: string, layer: MemoryLayer): Promise<T[]>;

  /**
   * 獲取特定層級的所有記憶
   * @param layer 記憶層級
   */
  findAllByLayer(layer: MemoryLayer): Promise<T[]>;

  /**
   * 獲取 L1 索引列表
   * @param sessionId 會話識別碼
   */
  getL1Index(sessionId: string): Promise<string[]>;
}
