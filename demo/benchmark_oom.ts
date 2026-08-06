import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_CONFIG } from '../src/core/config/DefaultConfig';
import {
    FileSystemDataBlockRepository
} from '../src/core/infra/persistence/repository/FileSystemDataBlockRepository';
import { DataBlock, MessagePriority } from '../src/core/messaging/DataBlock';

async function runOomBenchmark() {
    console.log("🔥 啟動十萬級歷史對話 OOM 防禦戰壓測...");
    console.log("==========================================");

    const testDir = path.join(process.cwd(), "workspace", "benchmark_oom_test");
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // 建立 Repo (使用預設 Config，依賴我們的 LRU Cache 與防禦性設定)
    const repo = new FileSystemDataBlockRepository(DEFAULT_CONFIG as any, testDir);

    const SESSION_ID = "oom-session-999";
    const AGENT_ID = "main-agent";

    // 產生一筆巨大訊息 (約 5KB 的連續字串)
    const heavyPayload = "A".repeat(5000);

    const totalMessages = 100_000;
    const batchSize = 10_000;
    
    // 取得初始記憶體 (MB)
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Bun.nanoseconds();

    console.log(`開始向系統灌入 ${totalMessages.toLocaleString()} 筆對話，理論總容量大約 500 MB...\n`);

    for (let i = 0; i < totalMessages; i += batchSize) {
        const blocks: DataBlock<any>[] = [];
        for (let j = 0; j < batchSize; j++) {
            const index = i + j;
            blocks.push(new DataBlock({
                sessionId: SESSION_ID,
                senderId: "user",
                targetId: AGENT_ID,
                type: "human",
                priority: MessagePriority.NORMAL,
                controlPayload: heavyPayload + ` [MSG_ID: ${index}]`
            }));
        }
        
        // 批次追加寫入 (這裡將會觸發底層的 JSONL I/O 寫入與滑動視窗)
        await repo.saveForAgent(SESSION_ID, AGENT_ID, blocks);
        
        const currentMemory = process.memoryUsage().heapUsed;
        console.log(`✅ 已寫入 ${i + batchSize} 筆巨量歷史... 當前 Heap 記憶體: ${(currentMemory / 1024 / 1024).toFixed(2)} MB`);
    }

    const endTime = Bun.nanoseconds();
    const endMemory = process.memoryUsage().heapUsed;

    const durationMs = (endTime - startTime) / 1_000_000;
    const memoryDelta = (endMemory - startMemory) / 1024 / 1024;

    console.log("\n📊 OOM 壓測總結:");
    console.log(`------------------------------------------`);
    console.log(`- 總計寫入: ${totalMessages.toLocaleString()} 筆歷史對話 (每筆 ~5KB)`);
    console.log(`- 理論總負載: ~500 MB 的記憶體壓力`);
    console.log(`- 總 I/O 耗時: ${durationMs.toFixed(2)} ms`);
    console.log(`- 記憶體實際漲幅 (Memory Delta): ${memoryDelta.toFixed(2)} MB`);
    
    if (memoryDelta < 50) {
        console.log("\n🛡️ 結論：成功防禦 OOM！");
        console.log("記憶體漲幅遠低於理論資料量，證明底層的 Offloading 與滑動視窗(LRU)機制完美攔截了所有的記憶體洩漏！");
    } else {
        console.log("\n⚠️ 結論：記憶體漲幅過高，系統可能有 Leak，請檢查 LRUCache 上限！");
    }

    // 清理殘留的測試資料夾
    fs.rmSync(testDir, { recursive: true, force: true });
}

runOomBenchmark();
