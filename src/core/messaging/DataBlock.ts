import { BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

import { IdGenerator } from '../utils/IdGenerator';

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
 * DataBlockRole
 * 定義投遞給 LLM 時的 Message 角色類型
 */
export type DataBlockRole = 'message' | 'tool' | 'system';

/**
 * 序列化資料訊息塊介面
 */
export interface DataBlockData {
    id: string;
    sessionId: string;
    threadId: string | null;
    senderId: string;
    targetId: string | null;
    type: DataBlockRole;
    intent: string;
    timestamp: number;
    controlPayload: any;
    dataPointers: IDataPointer[];
}

/**
 * 系統內所有節點傳遞資訊與狀態的通用載體 (DataBlock)
 * 同時代表系統級的非同步 Message 封裝，支持直接轉換為 LangChain Message。
 */
export class DataBlock<TControlPayload = Record<string, any>> {
    /** 全局唯一識別碼 */
    public readonly id: string;
    /** 所屬會話 ID (Session ID) */
    public readonly sessionId: string;
    /** 可選：執行緒 ID (Thread ID) */
    public readonly threadId: string | null;
    /** 發送此 DataBlock 的 Agent 或 Worker ID */
    public readonly senderId: string;
    /** 接收此 DataBlock 的目標 ID。若為 null，則代表向上回報 or 廣播 */
    public readonly targetId: string | null;

    /** 
     * 角色類型 (Enum)：決定投遞給 LLM 時的 Message 角色
     */
    public readonly type: DataBlockRole;

    /**
     * 業務意圖：記錄具體事件名稱 (e.g. 'TASK_SUCCESS', 'GIT_CONFLICT', 'HITL_APPROVED')
     */
    public readonly intent: string;

    /** 生成時間戳 */
    public readonly timestamp: number;

    /**
     * 控制面負載 (Control Plane Payload)
     * 僅允許存放輕量級的 JSON 狀態、指令參數或簡短文字。
     */
    public readonly controlPayload: TControlPayload;

    /**
     * 資料面指標 (Data Plane Pointers)
     * 若任務產生了巨量資料，該資料實體應存於 Workspace，此處僅傳遞指標。
     */
    public readonly dataPointers: IDataPointer[];

    constructor(params: {
        sessionId: string;
        threadId?: string | null;
        senderId: string;
        targetId?: string | null;
        type: DataBlockRole;
        intent: string;
        controlPayload: TControlPayload;
        dataPointers?: IDataPointer[];
        id?: string;        // 支援反序列化載入已有的 ID
        timestamp?: number; // 支援反序列化載入已有的時間戳
    }) {
        this.id = params.id || IdGenerator.dataBlock();
        this.timestamp = params.timestamp || Date.now();
        this.sessionId = params.sessionId;
        this.threadId = params.threadId || null;
        this.senderId = params.senderId;
        this.targetId = params.targetId || null;
        this.type = params.type;
        this.intent = params.intent;
        this.controlPayload = params.controlPayload;
        this.dataPointers = params.dataPointers || [];
    }

    /**
     * 驗證 DataBlock 是否過大
     * 若 controlPayload 經過 JSON.stringify 後超過 100KB，拋出警告
     */
    public validateSize(): void {
        const payloadSize = Buffer.byteLength(JSON.stringify(this.controlPayload), 'utf8');
        const MAX_SIZE = 100 * 1024; // 100 KB
        if (payloadSize > MAX_SIZE) {
            console.warn(`[WARNING] DataBlock ${this.id} payload size (${payloadSize} bytes) exceeds 100KB limit! Please use dataPointers (Data Plane) for large data.`);
        }
    }

    /**
     * 將 DataBlock 的屬性與負載格式化轉換為結構化的 Markdown 文本。
     * - 若 type !== 'system'：直接回傳 controlPayload 中的純文字內容（text/content/stdout），不附加任何系統裝飾。
     * - 若 type === 'system'：回傳精美的結構化 Markdown 系統事件回報。
     */
    public toMarkdown(): string {
        if (this.type !== 'system') {
            if (typeof this.controlPayload === 'string') {
                return this.controlPayload;
            }
            return JSON.stringify(this.controlPayload);
        }

        // system 類型的結構化 Markdown 渲染
        const lines: string[] = [];
        const dateStr = new Date(this.timestamp).toISOString();

        lines.push(`### [EVENT: ${this.intent.toUpperCase()}]`);
        lines.push(`* **Sender**: \`${this.senderId}\``);
        lines.push(`* **Time**: \`${dateStr}\``);

        // 格式化 Control Payload
        if (this.controlPayload && Object.keys(this.controlPayload).length > 0) {
            lines.push(`* **Payload**:`);
            lines.push('```json');
            lines.push(JSON.stringify(this.controlPayload, null, 2));
            lines.push('```');
        }

        // 格式化 Data Pointers
        if (this.dataPointers && this.dataPointers.length > 0) {
            lines.push(`* **Data Pointers**:`);
            for (const ptr of this.dataPointers) {
                const metadataStr = ptr.metadata ? ` (metadata: ${JSON.stringify(ptr.metadata)})` : '';
                lines.push(`  - **${ptr.type}**: [${ptr.uri}](${ptr.uri})${metadataStr}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * 將 DataBlock 轉換為 LangChain 規格的 BaseMessage 物件。
     * 自動進行角色對齊與 LangChain 強型別物件實例化。
     */
    public toMessage(): BaseMessage {
        const content = this.toMarkdown();

        if (this.type === 'system') {
            return new SystemMessage({ content });
        }

        if (this.type === 'message') {
            return new HumanMessage({ content });
        }

        if (this.type === 'tool') {
            // ToolMessage 在 LangChain 中必須有 tool_call_id
            const toolCallId = (this.controlPayload as any).toolCallId || this.id;
            return new ToolMessage({
                content,
                tool_call_id: toolCallId
            });
        }

        throw new Error(`[DataBlock] Unsupported message type for LangChain conversion: ${this.type}`);
    }

    /**
     * 序列化 DataBlock 數據
     */
    public toJSON(): DataBlockData {
        return {
            id: this.id,
            sessionId: this.sessionId,
            threadId: this.threadId,
            senderId: this.senderId,
            targetId: this.targetId,
            type: this.type,
            intent: this.intent,
            timestamp: this.timestamp,
            controlPayload: this.controlPayload,
            dataPointers: this.dataPointers
        };
    }

    /**
     * 從序列化數據還原 DataBlock 實例
     */
    public static fromJSON(data: DataBlockData): DataBlock {
        return new DataBlock(data);
    }
}
