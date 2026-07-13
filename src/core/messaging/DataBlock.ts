import { IdGenerator } from '../../package/utils/IdGenerator';

/**
 * 定義巨型資料指標 (Data Pointer)
 * 實現「控制面與資料面分離」的核心，避免 EventBus 遭遇記憶體溢出
 */
export interface IDataPointer {
  /** 指標類型：實體檔案、虛擬檔案、外部快取 (如 Redis)、URL */
  type: 'FILE' | 'VFS' | 'CACHE' | 'URL';
  /** 資源定位符 (例如：vfs://agent-123/temp/data.html) */
  uri: string;
  /** 可選：資料的 MIME Type 或附帶的輕量級 Metadata */
  metadata?: Record<string, any>;
}

/**
 * 系統內所有節點傳遞資訊與狀態的通用載體 (DataBlock)
 */
export class DataBlock<TControlPayload = Record<string, any>> {
  /** 全局唯一識別碼 */
  public readonly id: string;
  /** 發送此 DataBlock 的 Agent 或 Worker ID */
  public readonly senderId: string;
  /** 接收此 DataBlock 的目標 ID。若為 null，則代表向上回報或廣播 */
  public readonly targetId: string | null;
  /** 訊息類型，用於 EventBus 路由與訂閱 (例如：'TASK_SUCCESS', 'GIT_CONFLICT') */
  public readonly type: string;
  /** 生成時間戳 */
  public readonly timestamp: number;

  /**
   * 控制面負載 (Control Plane Payload)
   * ⚠️ 嚴格限制：僅允許存放輕量級的 JSON 狀態、指令參數或簡短文字。
   * 絕不可放入大型 HTML、圖片、巨型 CSV 檔案內容。
   */
  public readonly controlPayload: TControlPayload;

  /**
   * 資料面指標 (Data Plane Pointers)
   * 若任務產生了巨量資料，該資料實體應存於 Workspace 或 Redis，此處僅傳遞指標。
   */
  public readonly dataPointers: IDataPointer[];

  constructor(params: {
    senderId: string;
    targetId?: string | null;
    type: string;
    controlPayload: TControlPayload;
    dataPointers?: IDataPointer[];
  }) {
    this.id = IdGenerator.dataBlock();
    this.timestamp = Date.now();
    this.senderId = params.senderId;
    this.targetId = params.targetId || null;
    this.type = params.type;
    this.controlPayload = params.controlPayload;
    this.dataPointers = params.dataPointers || [];
  }

  /**
   * 驗證 DataBlock 是否過大 (這是一個輕量級防呆機制，可選實作)
   * 若 controlPayload 經過 JSON.stringify 後超過 100KB，拋出警告，提示開發者改用 dataPointers
   */
  public validateSize(): void {
    const payloadSize = Buffer.byteLength(JSON.stringify(this.controlPayload), 'utf8');
    const MAX_SIZE = 100 * 1024; // 100 KB
    if (payloadSize > MAX_SIZE) {
      console.warn(`[WARNING] DataBlock ${this.id} payload size (${payloadSize} bytes) exceeds 100KB limit! Please use dataPointers (Data Plane) for large data.`);
    }
  }
}
