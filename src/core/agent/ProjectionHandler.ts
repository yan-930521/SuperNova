import { Config } from '../config/Config';
import { IDataBlockRepository, IRepository } from '../infra/persistence/IRepository';
import { DataBlock } from '../messaging/DataBlock';
import { LRUCache } from '../utils/LRUCache';
import { BaseAgent, ContextOverride } from './BaseAgent';

/**
 * 意識投影處理器 (Projection Handler)
 * 當大腦 (Brain) 進行意識投影時，負責作為暫時的無狀態執行器。
 * 內部包含記憶合併與快取機制，避免高頻率投影時過度消耗效能。
 */
export class ProjectionHandler {
    public readonly id: string;

    // 記憶快取 (使用內建 TTL 的 LRUCache)
    private readonly cache: LRUCache<string, DataBlock[]>;

    constructor(
        public readonly brain: BaseAgent,
        public readonly body: BaseAgent,
        private readonly dataBlockRepo: IDataBlockRepository,
        private readonly config: Config
    ) {
        this.id = brain.id; // 對外仍以 Brain 的身分活動
        this.cache = new LRUCache<string, DataBlock[]>(
            this.config.cache.projection_lru_size,
            this.config.cache.projection_ttl_ms
        );
    }

    /**
     * 合併並快取雙方的記憶歷史
     */
    private async getMergedHistory(): Promise<DataBlock[]> {
        const cacheKey = `${this.brain.sessionId}:${this.brain.id}:${this.body.id}`;
        
        // LRUCache 內部已自動處理超時，過期會回傳 undefined
        const cached = this.cache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        // 分別拉取雙方歷史
        const brainBlocks = await this.dataBlockRepo.findByAgent(this.brain.sessionId, this.brain.id);
        const bodyBlocks = await this.dataBlockRepo.findByAgent(this.body.sessionId, this.body.id);

        // 依據時間戳合併並排序 (改用 O(N) 的雙指標合併)
        const mergedHistory: DataBlock[] = [];
        let i = 0, j = 0;
        while (i < brainBlocks.length && j < bodyBlocks.length) {
            if (brainBlocks[i].timestamp <= bodyBlocks[j].timestamp) {
                mergedHistory.push(brainBlocks[i++]);
            } else {
                mergedHistory.push(bodyBlocks[j++]);
            }
        }
        while (i < brainBlocks.length) {
            mergedHistory.push(brainBlocks[i++]);
        }
        while (j < bodyBlocks.length) {
            mergedHistory.push(bodyBlocks[j++]);
        }
        
        this.cache.set(cacheKey, mergedHistory);
        return mergedHistory;
    }

    /**
     * 清除快取 (可供外部或發送新訊息後強制觸發)
     */
    public invalidateCache(): void {
        this.cache.clear();
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
            // 保留併發處理所有批次訊息的優勢
            const promises = messageBatches.map(async (messages) => {
                const { usageDelta } = await this.body.processInbox(messages, contextOverride);

                // 投影期間的 Token 消耗算在大腦頭上
                this.brain.recordUsage(usageDelta);
                
                // 【關鍵修正】只要有任何一個並發任務完成（代表可能寫入了新的 AI 回覆至 DB），
                // 就立刻失效快取，避免其他正在啟動的並發任務讀到髒資料！
                this.invalidateCache();
            });

            await Promise.all(promises);
        } catch (err) {
            throw err;
        }
    }
}
