import { ILifecycle } from '../../../core/lifecycle/ILifecycle';
import { recorder } from '../../LogManager';
import { IEntity, IRepository } from '../IRepository';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 基礎檔案系統儲存庫實作
 * 提供通用的 JSON 檔案讀寫邏輯，減少重複代碼，確保日誌與錯誤處理的一致性。
 */
export abstract class BaseFileSystemRepository<T extends IEntity> implements IRepository<T> {
  /**
   * @param baseDir 儲存根目錄
   * @param componentName 用於日誌紀錄的組件名稱 (例如: "SessionRepo")
   */
  constructor(
    protected readonly baseDir: string,
    protected readonly componentName: string
  ) {}

  /**
   * 初始化組件：確保儲存目錄存在
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      recorder.info(`[${this.componentName}] Initialized storage at: ${this.baseDir}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[${this.componentName}] Initialization failed`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 啟動階段 (目前無特定邏輯)
   */
  async start(): Promise<void> {}

  /**
   * 停機階段 (目前無特定邏輯)
   */
  async stop(): Promise<void> {}

  /**
   * 保存實體數據至 JSON 檔案
   * @param entity 具備 ID 的實體對象
   */
  async save(entity: T): Promise<void> {
    const filePath = this.getFilePath(entity.id);
    try {
      await fs.writeFile(filePath, JSON.stringify(entity, null, 2), 'utf-8');
      recorder.debug(`[${this.componentName}] Saved entity: ${entity.id}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[${this.componentName}] Failed to save entity: ${entity.id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 從 JSON 檔案載入實體數據
   * @param id 實體識別碼
   */
  async load(id: string): Promise<T | null> {
    const filePath = this.getFilePath(id);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as T;
    } catch (error) {
      // 檔案不存在不視為異常錯誤，僅返回 null
      return null;
    }
  }

  /**
   * 刪除實體對應的檔案
   * @param id 實體識別碼
   */
  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      recorder.info(`[${this.componentName}] Deleted entity: ${id}`, { type: 'SYSTEM' });
    } catch (error) {
      // 若檔案本來就部存在，則忽略錯誤
      recorder.error(`[${this.componentName}] Failed to delete entity: ${id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  /**
   * 列出根目錄下所有的 JSON 實體 ID
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * 檢查實體檔案是否存在
   * @param id 實體識別碼
   */
  async exists(id: string): Promise<boolean> {
    try {
      await fs.access(this.getFilePath(id));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 取得檔案完整路徑
   * @param id 實體識別碼
   */
  protected getFilePath(id: string): string {
    return path.join(this.baseDir, `${id}.json`);
  }

  /**
   * 取得特定作用域的目錄 (例如會話目錄)
   * @param scopeDir 子目錄路徑片段
   */
  protected async getScopedDir(scopeDir: string): Promise<string> {
    const fullPath = path.join(this.baseDir, scopeDir);
    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }
}
