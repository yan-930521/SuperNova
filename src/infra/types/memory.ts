/**
 * 記憶體層級型別
 */
export type MemoryLayer = 'L1' | 'L2' | 'L3';

/**
 * 統一記憶體傳輸對象 (Memory DTO)
 */
export interface MemoryDTO<T = any> {
  /** 唯一識別 ID (例如: "mem_l2_001") */
  readonly id: string;
  /** 關聯的會話 ID (或 "global") */
  readonly sessionId: string;
  /** 所屬層級 (L1, L2, L3) */
  readonly layer: MemoryLayer;
  /** 寫入者 Agent ID */
  readonly authorId: string;
  /** 寫入時間戳 */
  readonly timestamp: number;
  /** 實際資料負載 */
  readonly data: T;
  /** 擴展元數據 */
  readonly metadata?: Record<string, any>;
}

/**
 * L1 黑板指針數據
 */
export interface IBlackboardPointer {
  readonly key: string;          // 語義 Key
  readonly pointerId: string;    // 實際 ID
  readonly description: string;  // 描述
}

/**
 * L2 事實層數據
 */
export interface IFactData {
  readonly topic: string;
  readonly content: any;
  readonly confidence: number;
  readonly sourceTaskId?: string;
  readonly verifiedBy?: string;
}

/**
 * L3 SOP 層數據
 */
export interface ISOPData {
  readonly title: string;
  readonly steps: string[];
  readonly conditions: string[];
  readonly failureCases?: {
    readonly problem: string;
    readonly solution: string;
  }[];
}
