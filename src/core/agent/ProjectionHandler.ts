import { IDataBlockRepository, IRepository } from '../infra/persistence/IRepository';
import { DataBlock } from '../messaging/DataBlock';
import { BaseAgent, ContextOverride } from './BaseAgent';

/**
 * 意識投影處理器 (Projection Handler)
 * 當大腦 (Brain) 進行意識投影時，負責作為暫時的無狀態執行器。
 * 內部包含記憶合併與快取機制，避免高頻率投影時過度消耗效能。
 */
export class ProjectionHandler {
    public readonly id: string;

    // 記憶快取
    private cachedMergedHistory: DataBlock[] | null = null;
    private lastCacheTime: number = 0;
    private readonly CACHE_TTL = 5000; // 快取有效期限 (毫秒)，可依需求調整

    constructor(
        public readonly brain: BaseAgent,
        public readonly body: BaseAgent,
        private readonly dataBlockRepo: IDataBlockRepository
    ) {
        this.id = brain.id; // 對外仍以 Brain 的身分活動
    }

    /**
     * 合併並快取雙方的記憶歷史
     */
    private async getMergedHistory(): Promise<DataBlock[]> {
        const now = Date.now();
        if (this.cachedMergedHistory && (now - this.lastCacheTime < this.CACHE_TTL)) {
            return this.cachedMergedHistory;
        }

        // 分別拉取雙方歷史
        const brainBlocks = await this.dataBlockRepo.findByAgent(this.brain.sessionId, this.brain.id);
        const bodyBlocks = await this.dataBlockRepo.findByAgent(this.body.sessionId, this.body.id);

        // 依據時間戳合併並排序
        this.cachedMergedHistory = [...brainBlocks, ...bodyBlocks].sort((a, b) => a.timestamp - b.timestamp);
        this.lastCacheTime = now;

        return this.cachedMergedHistory;
    }

    /**
     * 清除快取 (可供外部或發送新訊息後強制觸發)
     */
    public invalidateCache(): void {
        this.cachedMergedHistory = null;
        this.lastCacheTime = 0;
    }

    public async resume(messageBatches: DataBlock[][]): Promise<void> {
        const brainProfile = this.brain.getProfile();
        const combinedTools = [...this.body.getTools(), ...this.brain.getTools()];

        // 取得合併且快取過的歷史紀錄
        const fullHistory = await this.getMergedHistory();

        const contextOverride: ContextOverride = {
            profile: brainProfile,
            tools: combinedTools,
            agentId: this.brain.id, // 投影期間，對話與思考存檔依然歸屬於大腦
            envState: this.body.getEnvState(), // 使用軀殼的物理感官狀態
            fullHistory: fullHistory // 繞過 BaseAgent 內部的 DB Fetch
        };

        // 在送入 processInbox 之前，觸發大腦的 Hook，讓外掛把設定塞進 contextOverride 中！
        await this.brain.invokeBeforeStepHook(contextOverride);

        try {
            // 併發處理所有批次訊息
            const promises = messageBatches.map(async (messages) => {
                const { usageDelta } = await this.body.processInbox(messages, contextOverride);

                // 投影期間的 Token 消耗算在大腦頭上
                this.brain.recordUsage(usageDelta);
            });

            await Promise.all(promises);

            // 處理完畢後，由於可能產生了新的 AI 回覆 (寫入了 DB)，使快取失效
            this.invalidateCache();
        } catch (err) {
            throw err;
        }
    }
}
