import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_CONFIG } from '../src/core/config/DefaultConfig';
import {
    FileSystemDataBlockRepository
} from '../src/core/infra/persistence/repository/FileSystemDataBlockRepository';
import { DataBlock, MessagePriority } from '../src/core/messaging/DataBlock';

async function runOomBenchmark() {
    console.log("🔥 Starting 100k-scale Historical Dialogue OOM Defense Stress Test...");
    console.log("==================================================================");

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

    console.log(`Starting to inject ${totalMessages.toLocaleString()} messages into the system, theoretical total capacity is about 500 MB...\n`);

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
        console.log(`✅ Written ${i + batchSize} massive historical entries... Current Heap Memory: ${(currentMemory / 1024 / 1024).toFixed(2)} MB`);
    }

    const endTime = Bun.nanoseconds();
    const endMemory = process.memoryUsage().heapUsed;

    const durationMs = (endTime - startTime) / 1_000_000;
    const memoryDelta = (endMemory - startMemory) / 1024 / 1024;

    console.log("\n📊 OOM Benchmark Summary:");
    console.log(`------------------------------------------`);
    console.log(`- Total written: ${totalMessages.toLocaleString()} historical messages (~5KB each)`);
    console.log(`- Theoretical load: ~500 MB of memory pressure`);
    console.log(`- Total I/O time: ${durationMs.toFixed(2)} ms`);
    console.log(`- Actual Memory Delta: ${memoryDelta.toFixed(2)} MB`);
    
    if (memoryDelta < 50) {
        console.log("\n🛡️ Conclusion: Successfully defended against OOM!");
        console.log("The memory increase is far below the theoretical data volume, proving that the underlying Offloading and Sliding Window (LRU) mechanisms perfectly intercepted all memory leaks!");
    } else {
        console.log("\n⚠️ Conclusion: Memory increase is too high, the system might have a leak. Please check the LRUCache limit!");
    }

    // 清理殘留的測試資料夾
    fs.rmSync(testDir, { recursive: true, force: true });
}

runOomBenchmark();
