import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_CONFIG } from '../../src/core/config/DefaultConfig';
import {
    FileSystemDataBlockRepository
} from '../../src/core/infra/repositories/FileSystemDataBlockRepository';
import { DataBlock, MessagePriority } from '../../src/core/messaging/DataBlock';

async function runOomBenchmark() {
    console.log("🔥 SuperNova OOM Defense Stress Test");
    console.log("====================================\n");

    const testDir = path.join(process.cwd(), "workspace", "benchmark_oom_test");
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // 建立 Repo (使用預設 Config，依賴底層 LRU Cache 與防禦性設定)
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

    console.log(`Injecting ${totalMessages.toLocaleString()} messages (~5KB each, ~500MB total)...\n`);

    const memorySnapshots: { count: number; heapMB: number }[] = [];

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

        // 批次追加寫入 (觸發底層的 JSONL I/O 寫入與滑動視窗)
        await repo.saveForAgent(SESSION_ID, AGENT_ID, blocks);

        const currentMemory = process.memoryUsage().heapUsed;
        const heapMB = currentMemory / 1024 / 1024;
        const written = i + batchSize;

        memorySnapshots.push({ count: written, heapMB });
        console.log(`  ✅ ${written.toLocaleString()} entries written | Heap: ${heapMB.toFixed(2)} MB`);
    }

    const endTime = Bun.nanoseconds();
    const endMemory = process.memoryUsage().heapUsed;

    const durationMs = (endTime - startTime) / 1_000_000;
    const memoryDelta = (endMemory - startMemory) / 1024 / 1024;
    const peakMemory = Math.max(...memorySnapshots.map(s => s.heapMB));

    console.log("\n📊 OOM Defense Summary");
    console.log("─".repeat(50));
    console.log(`  Total Written    : ${totalMessages.toLocaleString()} messages`);
    console.log(`  Payload Size     : ~5 KB / message`);
    console.log(`  Theoretical Load : ~500 MB`);
    console.log(`  Total I/O Time   : ${(durationMs / 1000).toFixed(2)} s`);
    console.log(`  Throughput       : ${Math.round(totalMessages / (durationMs / 1000)).toLocaleString()} msg/s`);
    console.log(`  Peak Heap Memory : ${peakMemory.toFixed(2)} MB`);
    console.log(`  Memory Delta     : ${memoryDelta.toFixed(2)} MB`);
    console.log("─".repeat(50));

    // 清理殘留的測試資料夾
    fs.rmSync(testDir, { recursive: true, force: true });
}

runOomBenchmark();
