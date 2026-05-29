import { MessageDTO } from './session';

/**
 * 記憶層級 Enum
 * 定義記憶存儲的生命週期與用途。
 */
export enum MemoryLayer {
  /** 工作記憶 (短暫，關聯到特定 Chain 或 Session) */
  WORKING = 'WORKING',
  /** 持久記憶 (長期存儲，跨 Session 可用) */
  PERSISTENT = 'PERSISTENT'
}

/**
 * 記憶類型 Enum
 */
export enum MemoryType {
  /** 變數/鍵值對 */
  VARIABLE = 'variable',
  /** 緩衝區 (對話片段) */
  BUFFER = 'buffer',
  /** 事實/知識點 */
  FACT = 'fact',
  /** 標準作業程序 */
  SOP = 'sop'
}

/**
 * 記憶數據傳輸對象 (Memory Data Transfer Object)
 * 用於封裝記憶內容及其元數據。
 */
export interface MemoryDTO {
  /** 記憶唯一識別碼 */
  id: string;
  /** 所屬記憶層級 */
  layer: MemoryLayer;
  /** 命名空間 (用於分類或隔離不同模組的記憶) */
  namespace: string;
  /** 記憶類型 */
  type: MemoryType;
  /** 記憶核心內容 */
  content: string;
  /** 記憶摘要 (可選) */
  summary?: string;
  /** 標籤列表 (用於檢索與檢索強化) */
  tags: string[];
  /** 關聯的會話 ID */
  sessionId: string;
  /** 關聯的鏈 ID (僅 WORKING 層級有效) */
  chainId?: string;
  /** 存儲時間戳 */
  timestamp: number;
  /** 額外的業務元數據 */
  metadata?: Record<string, any>;
}

/**
 * 記憶儲存庫接口
 * 負責 MemoryDTO 的持久化操作。
 */
export interface IMemoryRepository {
  /**
   * 保存或更新記憶
   * @param memory 記憶數據對象
   */
  save(memory: MemoryDTO): Promise<void>;

  /**
   * 根據 ID 查找記憶
   * @param id 記憶識別碼
   * @param sessionId 會話識別碼
   */
  findById(id: string, sessionId: string): Promise<MemoryDTO | null>;

  /**
   * 根據命名空間查找特定會話的所有記憶
   * @param namespace 命名空間
   * @param sessionId 會話識別碼
   */
  findByNamespace(namespace: string, sessionId: string): Promise<MemoryDTO[]>;

  /**
   * 刪除特定記憶
   * @param id 記憶識別碼
   * @param sessionId 會話識別碼
   */
  delete(id: string, sessionId: string): Promise<void>;

  /**
   * 獲取一級索引 (L1 Index)
   * 掃描會話下的可用標籤或 ID 列表。
   * @param sessionId 會話識別碼
   * @returns 可用的標籤或 ID 列表
   */
  getL1Index(sessionId: string): Promise<string[]>;
}
