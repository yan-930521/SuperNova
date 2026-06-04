import { IEntity } from '../../infra/persistence/IRepository';
import { MemoryLayer, MemoryDTO } from '../../infra/types/memory';

/**
 * 基礎記憶體實體 (BaseMemory)
 * 代表單一條記憶數據的基底，遵循「一項領域對象即一條數據」原則。
 * 參考 BaseSession 結構設計。
 */
export abstract class BaseMemory implements IEntity {
  /** 額外元數據 */
  public metadata: Record<string, any> = {};

  constructor(
    /** 唯一識別 ID */
    public readonly id: string,
    /** 關聯的會話 ID (或 "global") */
    public readonly sessionId: string,
    /** 所屬層級 */
    public readonly layer: MemoryLayer,
    /** 寫入者 Agent ID */
    public readonly authorId: string,
    /** 寫入時間戳 */
    public readonly timestamp: number
  ) {}

  /**
   * 轉換為傳輸對象 (DTO)
   */
  public abstract toDTO(): MemoryDTO;
}
