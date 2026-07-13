import { ILifecycle } from '../../../core/lifecycle/ILifecycle';

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