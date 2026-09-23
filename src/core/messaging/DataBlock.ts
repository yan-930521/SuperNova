import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IdGenerator } from '@supernova/common/IdGenerator';
import { LogManager } from '@supernova/common/LogManager';
import { IDataBlock } from '@supernova/events/IBus';

import {
    DataBlockData, DataBlockParams, DataBlockRole, IDataPointer, MessagePriority
} from './types';

/**
 * 系統內所有節點傳遞資訊與狀態的通用載體 (DataBlock)
 * 遵循控制面與資料面分離原則：
 * 1. 攜帶完整會話路由與優先級元資料 (sessionId, senderId, targetId, priority, intent)
 * 2. 支援巨型資料指標 (IDataPointer) 隔離，防禦記憶體溢出 (OOM)
 * 3. 支援結構化 Markdown 渲染與無縫轉譯為 LangChain BaseMessage
 */
export class DataBlock<TControlPayload = any> implements IDataBlock {
    /** 全局唯一識別碼 */
    public readonly id: string;

    /** 所屬會話 ID (Session ID) */
    public readonly sessionId: string;

    /** 可選：執行緒 ID (Thread ID) */
    public readonly threadId: string | null;

    /** 發送此 DataBlock 的實體 ID (例如 User, AgentId, WorkerId) */
    public readonly senderId: string;

    /** 接收此 DataBlock 的目標 ID。若為 null 則代表向上回報或公頻廣播 */
    public readonly targetId: string | null;

    /** 角色類型：決定投遞給 LLM 時的 Message 角色 */
    public readonly type: DataBlockRole;

    /** 訊息意圖標籤 (例如 'USER_INPUT', 'TASK_RESULT', 'ENVIRONMENT_PERCEPTION') */
    public readonly intent: string;

    /** 訊息優先度 (影響收件箱排程與是否強制即時喚醒) */
    public readonly priority: MessagePriority;

    /** 建立時間戳 */
    public readonly timestamp: number;

    /** 核心控制負載 (任意 JSON 結構或純字串) */
    public readonly controlPayload: TControlPayload;

    /** 資料指標陣列 (巨型資料檔案/VFS隔離) */
    public readonly dataPointers: IDataPointer[];

    /** 內部附加元資料儲存區 */
    public metadata: Record<string, any>;

    /** 快取 LangChain 轉譯實例，避免重複序列化與記憶體分配 */
    private readonly messageCache = new Map<string, BaseMessage>();

    /** 持久化標記：是否已經將過大的 Payload 卸載為指標 (Offloaded) */
    public get isOffloaded(): boolean {
        return this.metadata.isOffloaded ?? false;
    }
    public set isOffloaded(value: boolean) {
        this.metadata.isOffloaded = value;
    }

    /** 記憶體內的瞬態標記，標示是否已通過壓縮檢查 */
    public get isCompacted(): boolean {
        return this.metadata.isCompacted ?? false;
    }
    public set isCompacted(value: boolean) {
        this.metadata.isCompacted = value;
    }

    /** 圖譜記憶萃取標記：標示是否已被 MemoryManager 萃取為圖譜節點 */
    public get isExtracted(): boolean {
        return this.metadata.isExtracted ?? false;
    }
    public set isExtracted(value: boolean) {
        this.metadata.isExtracted = value;
    }

    constructor(params: DataBlockParams<TControlPayload>) {
        this.id = params.id || IdGenerator.dataBlock();
        this.sessionId = params.sessionId;
        this.threadId = params.threadId || null;
        this.senderId = params.senderId;
        this.targetId = params.targetId || null;
        this.type = params.type || 'system';
        this.intent = params.intent || 'GENERAL';
        this.priority = params.priority ?? MessagePriority.NORMAL;
        this.timestamp = params.timestamp || Date.now();
        this.controlPayload = params.controlPayload !== undefined ? params.controlPayload : ({} as TControlPayload);
        this.dataPointers = params.dataPointers || [];
        this.metadata = params.metadata || {};
    }

    /**
     * 驗證 DataBlock 是否超過安全大小限制 (防禦性檢測)
     * @param thresholdLength 允許的最大字元長度 (預設 100KB)
     */
    public validateSize(thresholdLength: number = 100 * 1024): boolean {
        try {
            const payloadStr = typeof this.controlPayload === 'string'
                ? this.controlPayload
                : (JSON.stringify(this.controlPayload) || '');

            if (payloadStr.length >= thresholdLength) {
                LogManager.recorder.warn(
                    `DataBlock [${this.id}] payload size (${payloadStr.length} chars) exceeds threshold [${thresholdLength}].`
                );
                return false;
            }
            return true;
        } catch (error) {
            LogManager.recorder.warn(`Failed to stringify DataBlock [${this.id}] for size check: ${String(error)}`);
            return false;
        }
    }

    /**
     * 遞迴走訪 Payload，對過大字串進行非同步處理與替換 (例如卸載為 Blob 檔案)
     * @param payload 原始資料節點
     * @param thresholdLength 觸發卸載的長度閥值
     * @param replacer 替換處理器
     */
    public static async traverseAndReplaceLargeStrings(
        payload: any,
        thresholdLength: number,
        replacer: (largeString: string) => Promise<any>
    ): Promise<{ newPayload: any; hasChanges: boolean }> {
        let hasChanges = false;

        const processNode = async (node: any): Promise<any> => {
            if (node === null || node === undefined) return node;

            if (typeof node === 'string') {
                if (node.length >= thresholdLength) {
                    hasChanges = true;
                    return await replacer(node);
                }
                return node;
            }

            if (Array.isArray(node)) {
                const newArray = [];
                for (let i = 0; i < node.length; i++) {
                    newArray.push(await processNode(node[i]));
                }
                return newArray;
            }

            if (typeof node === 'object') {
                const newObj: any = {};
                for (const [key, value] of Object.entries(node)) {
                    newObj[key] = await processNode(value);
                }
                return newObj;
            }

            return node;
        };

        const newPayload = await processNode(payload);
        return { newPayload, hasChanges };
    }

    /**
     * 將 DataBlock 的屬性與負載格式化為結構化 Markdown 文本
     * - non-system (human/ai)：若為字串直接輸出純文字，避免對話受到多餘系統排版干擾
     * - system / tool：輸出帶有時間、意圖與狀態的結構化區塊
     */
    public toMarkdown(saveTokens: boolean = false): string {
        if (this.type !== 'system' && this.type !== 'tool') {
            if (typeof this.controlPayload === 'string') {
                return this.controlPayload;
            }
            return JSON.stringify(this.controlPayload);
        }

        const lines: string[] = [];
        const dateStr = new Date(this.timestamp).toISOString();

        if (this.type === 'system') {
            if (saveTokens) {
                lines.push(`[SYS: ${this.intent.toUpperCase()}]`);
                if (this.priority > MessagePriority.NORMAL) lines.push('(!URGENT!)');
            } else {
                lines.push(`### [EVENT: ${this.intent.toUpperCase()}]`);
                lines.push(`- **Sender**: \`${this.senderId}\``);
                if (this.priority > MessagePriority.NORMAL) {
                    lines.push('- **Priority**: `URGENT / HIGH`');
                }
                lines.push(`- **Time**: \`${dateStr}\``);
            }

            if (this.controlPayload && Object.keys(this.controlPayload).length > 0) {
                if (!saveTokens) lines.push('\n**Payload**:');
                lines.push('```json');
                lines.push(JSON.stringify(this.controlPayload, null, saveTokens ? 0 : 2));
                lines.push('```');
            }
        } else if (this.type === 'tool') {
            const payload = (this.controlPayload || {}) as Record<string, any>;
            const toolName = payload.toolName || 'UNKNOWN_TOOL';
            const isError = this.intent === 'TOOL_ERROR' || Boolean(payload.error);
            const statusIcon = isError ? 'ERROR' : 'SUCCESS';

            if (saveTokens) {
                lines.push(`[TOOL: ${toolName}] ${statusIcon}`);
            } else {
                lines.push(`### 🛠️ [TOOL: ${toolName}]`);
                lines.push(`- **Status**: ${statusIcon}`);
                lines.push(`- **Time**: \`${dateStr}\``);
            }

            if (payload.args && Object.keys(payload.args).length > 0) {
                if (!saveTokens) lines.push('\n**Arguments**:');
                lines.push('```json');
                lines.push(JSON.stringify(payload.args, null, saveTokens ? 0 : 2));
                lines.push('```');
            }

            if (isError && payload.error) {
                if (!saveTokens) lines.push('\n**Error Details**:');
                lines.push('```text');
                lines.push(String(payload.error));
                lines.push('```');
            } else if (payload.result !== undefined) {
                if (!saveTokens) lines.push('\n**Result**:');
                const resultStr = typeof payload.result === 'object'
                    ? JSON.stringify(payload.result, null, saveTokens ? 0 : 2)
                    : String(payload.result);
                const format = typeof payload.result === 'object' ? 'json' : 'text';
                lines.push(`\`\`\`${format}\n${resultStr}\n\`\`\``);
            }
        }

        // 附加巨型資料指標連結
        if (this.dataPointers && this.dataPointers.length > 0) {
            if (!saveTokens) lines.push('\n**Data Pointers**:');
            for (const ptr of this.dataPointers) {
                const metadataStr = ptr.metadata ? ` (metadata: ${JSON.stringify(ptr.metadata)})` : '';
                if (saveTokens) {
                    lines.push(`[PTR:${ptr.type}] ${ptr.uri}${metadataStr}`);
                } else {
                    lines.push(`- **${ptr.type}**: [${ptr.uri}](${ptr.uri})${metadataStr}`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * 將 DataBlock 轉換為 LangChain 規格的 BaseMessage 物件
     * @param readerId 當前讀取這則訊息的 Agent ID (用於角色識別與視角對齊)
     * @param saveTokens 是否啟用緊湊省 Token 模式
     */
    public toMessage(readerId?: string, saveTokens: boolean = false): BaseMessage {
        const cacheKey = `${readerId || 'none'}:${saveTokens}`;
        if (this.messageCache.has(cacheKey)) {
            return this.messageCache.get(cacheKey)!;
        }

        const content = this.toMarkdown(saveTokens);
        let msg: BaseMessage;

        if (this.type === 'system' || this.type === 'tool') {
            msg = new SystemMessage({ content });
        } else if (this.type === 'human') {
            msg = new HumanMessage({ content: `[Message from ${this.senderId}]:\n${content}` });
        } else if (this.type === 'ai') {
            // 若 AI 訊息是由第三方 Agent 發出，對讀取者而言應呈現為系統投遞的他者訊息
            if (readerId && this.senderId !== readerId) {
                msg = new SystemMessage({ content: `[Message from ${this.senderId}]:\n${content}` });
            } else {
                msg = new AIMessage({ content });
            }
        } else {
            throw new Error(`Unsupported message role type for LangChain conversion: [${this.type}]`);
        }

        this.messageCache.set(cacheKey, msg);
        return msg;
    }

    /**
     * 序列化 DataBlock 數據為純物件
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
            priority: this.priority,
            timestamp: this.timestamp,
            controlPayload: this.controlPayload,
            dataPointers: this.dataPointers,
            metadata: this.metadata,
        };
    }

    /**
     * 從序列化數據重建 DataBlock 實例
     */
    public static fromJSON(data: DataBlockData): DataBlock {
        return new DataBlock(data);
    }
}
