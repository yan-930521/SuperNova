import { IdGenerator } from '@supernova/common/IdGenerator';
import { DataBlock, DataBlockData, MessagePriority } from '../messaging';
import { ISession, SessionData, SessionParams, SessionState } from './types';

/**
 * 會話實體 (Session)
 * 作為 Agent 協同與溝通的隔離邊界與時間沙盒：
 * 1. 管理參與成員 (participantIds)
 * 2. 維護每個 Agent 的收件箱緩衝區 (inboxBuffer)
 * 3. 判斷是否有可喚醒 Agent 決策的訊息 (hasActionableMessages)
 * 4. 控制會話生命週期 (ACTIVE -> PAUSED -> CLOSED)
 */
export class Session implements ISession {
    /** 會話唯一識別碼 */
    public readonly id: string;

    /** 會話建立時間戳 */
    public readonly createdAt: number;

    /** 最後更新時間戳 */
    public updatedAt: number;

    /** 當前會話狀態機 */
    public status: SessionState;

    /** 關閉原因 (若已關閉) */
    public closeReason?: string;

    /** 會話自訂元資料 */
    public metadata: Record<string, any>;

    /** 參與此會話的 Agent 或實體 ID 集合 */
    public readonly participantIds: Set<string>;

    /** 各 Agent 專屬的收件箱隊列 (agentId -> DataBlock[]) */
    private readonly inboxBuffer: Map<string, DataBlock[]>;

    /**
     * 建立或反序列化會話實體
     * @param params 初始化參數
     */
    constructor(params: SessionParams = {}) {
        const now = Date.now();
        this.id = params.id ?? IdGenerator.session();
        this.createdAt = params.createdAt ?? now;
        this.updatedAt = params.updatedAt ?? now;
        this.status = params.status ?? SessionState.ACTIVE;
        this.closeReason = params.closeReason;
        this.metadata = params.metadata ? { ...params.metadata } : {};
        this.participantIds = new Set(params.participantIds ?? []);
        this.inboxBuffer = new Map<string, DataBlock[]>();

        // 若有傳入既有的收件箱緩衝區資料，進行還原
        if (params.inboxBuffer) {
            for (const [agentId, blocks] of Object.entries(params.inboxBuffer)) {
                const hydratedBlocks: DataBlock[] = blocks.map((b) => {
                    if (b instanceof DataBlock) {
                        return b;
                    }
                    return DataBlock.fromJSON(b as DataBlockData);
                });
                this.inboxBuffer.set(agentId, hydratedBlocks);
                this.participantIds.add(agentId);
            }
        }
    }

    /**
     * 註冊參與者加入此會話
     * @param agentId 參與者 ID
     */
    public registerParticipant(agentId: string): void {
        if (!this.participantIds.has(agentId)) {
            this.participantIds.add(agentId);
            this.touch();
        }
    }

    /**
     * 移除參與者
     * @param agentId 參與者 ID
     * @returns 是否成功移除
     */
    public removeParticipant(agentId: string): boolean {
        const removed = this.participantIds.delete(agentId);
        if (removed) {
            this.touch();
        }
        return removed;
    }

    /**
     * 檢查特定 Agent 是否為此會話成員
     * @param agentId 參與者 ID
     */
    public hasParticipant(agentId: string): boolean {
        return this.participantIds.has(agentId);
    }

    /**
     * 將 DataBlock 推送至特定 Agent 的收件箱
     * 邊界防禦：若會話已關閉，將拒絕新訊息以確保狀態一致性
     * @param agentId 目標 Agent ID
     * @param block 訊息封裝物件
     */
    public pushToInbox(agentId: string, block: DataBlock): void {
        if (this.status === SessionState.CLOSED) {
            throw new Error(`Cannot push message to closed session: ${this.id}`);
        }

        // 自動將該目標納入參與者清單
        this.registerParticipant(agentId);

        let queue = this.inboxBuffer.get(agentId);
        if (!queue) {
            queue = [];
            this.inboxBuffer.set(agentId, queue);
        }

        queue.push(block);
        this.touch();
    }

    /**
     * 提取特定 Agent 收件箱中的所有訊息，並清空該收件箱
     * @param agentId Agent ID
     * @returns 該 Agent 目前累積的所有 DataBlock 陣列
     */
    public popInbox(agentId: string): DataBlock[] {
        const queue = this.inboxBuffer.get(agentId);
        if (!queue || queue.length === 0) {
            return [];
        }

        const messages = [...queue];
        this.inboxBuffer.delete(agentId);
        this.touch();
        return messages;
    }

    /**
     * 預覽特定 Agent 收件箱內容而不取出
     * @param agentId Agent ID
     * @returns 唯讀的 DataBlock 陣列
     */
    public peekInbox(agentId: string): ReadonlyArray<DataBlock> {
        const queue = this.inboxBuffer.get(agentId);
        return queue ? [...queue] : [];
    }

    /**
     * 檢查特定 Agent 是否有未處理的訊息
     * @param agentId Agent ID
     */
    public hasPendingMessages(agentId: string): boolean {
        return this.getInboxSize(agentId) > 0;
    }

    /**
     * 評估是否具備可喚醒 Agent 進行思考推理的行動訊息條件
     * 喚醒判定策略：
     * 1. 會話必須處於活躍中 (ACTIVE)，PAUSED 或 CLOSED 不得喚醒
     * 2. 收件箱訊息數量達到強制喚醒門檻 (forceWakeupThreshold，預設 5)
     * 3. 收件箱中包含任一 HIGH 或 URGENT 優先級之重要/緊急訊息
     * @param agentId Agent ID
     * @param forceWakeupThreshold 強制喚醒數量門檻 (預設 5)
     */
    public hasActionableMessages(agentId: string, forceWakeupThreshold: number = 5): boolean {
        // 若會話被暫停或關閉，凍結自主喚醒
        if (this.status !== SessionState.ACTIVE) {
            return false;
        }

        const queue = this.inboxBuffer.get(agentId);
        if (!queue || queue.length === 0) {
            return false;
        }

        // 條件一：訊息積壓量達到門檻
        if (queue.length >= forceWakeupThreshold) {
            return true;
        }

        // 條件二：存在任一高優先級或緊急中斷訊息
        const hasHighPriority = queue.some((b) => b.priority >= MessagePriority.HIGH);
        return hasHighPriority;
    }

    /**
     * 取得特定 Agent 當前收件箱的訊息數量
     * @param agentId Agent ID
     */
    public getInboxSize(agentId: string): number {
        return this.inboxBuffer.get(agentId)?.length ?? 0;
    }

    /**
     * 暫停會話 (例如人機互動輸入等待或調試中)
     */
    public pause(): void {
        if (this.status === SessionState.CLOSED) {
            throw new Error(`Cannot pause closed session: ${this.id}`);
        }
        this.status = SessionState.PAUSED;
        this.touch();
    }

    /**
     * 恢復會話為活躍狀態
     */
    public resume(): void {
        if (this.status === SessionState.CLOSED) {
            throw new Error(`Cannot resume closed session: ${this.id}`);
        }
        this.status = SessionState.ACTIVE;
        this.touch();
    }

    /**
     * 關閉會話
     * @param reason 關閉原因描述
     */
    public close(reason?: string): void {
        this.status = SessionState.CLOSED;
        if (reason) {
            this.closeReason = reason;
        }
        this.touch();
    }

    /**
     * 更新最後活動時間戳
     */
    public touch(): void {
        this.updatedAt = Date.now();
    }

    /**
     * 序列化為純物件結構，便於儲存庫進行持久化
     */
    public toJSON(): SessionData {
        const serializedInbox: Record<string, DataBlockData[]> = {};
        for (const [agentId, blocks] of this.inboxBuffer.entries()) {
            serializedInbox[agentId] = blocks.map((b) => b.toJSON());
        }

        return {
            id: this.id,
            status: this.status,
            closeReason: this.closeReason,
            metadata: { ...this.metadata },
            participantIds: Array.from(this.participantIds),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            inboxBuffer: serializedInbox,
        };
    }

    /**
     * 從序列化資料結構反序列化建立 Session 實體
     * @param data 會話純物件資料
     */
    public static fromJSON(data: SessionData): Session {
        return new Session({
            id: data.id,
            status: data.status,
            closeReason: data.closeReason,
            metadata: data.metadata,
            participantIds: data.participantIds,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            inboxBuffer: data.inboxBuffer,
        });
    }
}
