import { bench, run } from 'mitata';

import { AgentEvent } from '../../src/core/domain/IBus';
import { DataBlock, MessagePriority } from '../../src/core/messaging/DataBlock';
import { EventBus } from '../../src/core/messaging/EventBus';
import { LRUCache } from '../../src/core/utils/LRUCache';

console.log("🚀 SuperNova Core Throughput Benchmark");
console.log("=======================================\n");

// ---------------------------------------------------------
// 1. LRUCache Benchmark
// ---------------------------------------------------------

const cache = new LRUCache<string, string>(50);

bench("LRUCache: Set & Evict (50-key cap, 100 writes)", () => {
    // 連續寫入超過容量上限的 Key，強迫觸發淘汰機制
    for (let i = 0; i < 100; i++) {
        cache.set(`key_${i}`, `value_${i}`);
    }
});

bench("LRUCache: Get (Hit)", () => {
    // 測量快取命中時的 O(1) 讀取速度
    cache.get("key_99");
});

bench("LRUCache: Get (Miss)", () => {
    // 測量快取未命中時的回傳速度
    cache.get("key_nonexistent");
});

// 大容量快取情境（模擬 SkillManager 等級的 500-key 快取）
const largeCache = new LRUCache<string, object>(500);
for (let i = 0; i < 500; i++) {
    largeCache.set(`skill_${i}`, { id: i, code: "A".repeat(200) });
}

bench("LRUCache: Large (500-key) Get Hit", () => {
    largeCache.get("skill_250");
});

bench("LRUCache: Large (500-key) Set & Evict", () => {
    for (let i = 500; i < 600; i++) {
        largeCache.set(`skill_${i}`, { id: i, code: "B".repeat(200) });
    }
});

// ---------------------------------------------------------
// 2. EventBus Benchmark
// ---------------------------------------------------------

const bus = new EventBus();

// 註冊空監聽者模擬實際運行環境
bus.subscribe(AgentEvent.AgentMessage, () => {
    // No-op
});

bench("EventBus: Publish (sync, 1 subscriber)", () => {
    bus.publish({
        type: AgentEvent.AgentMessage,
        sessionId: "benchmark-session",
        timestamp: Date.now(),
        payload: []
    });
});

// 註冊多個監聽者，測試廣播效能
const busMulti = new EventBus();
for (let i = 0; i < 10; i++) {
    busMulti.subscribe(AgentEvent.AgentMessage, () => {
        // No-op
    });
}

bench("EventBus: Publish (sync, 10 subscribers)", () => {
    busMulti.publish({
        type: AgentEvent.AgentMessage,
        sessionId: "benchmark-session",
        timestamp: Date.now(),
        payload: []
    });
});

bench("EventBus: PublishAsync (10 subscribers)", async () => {
    await busMulti.publishAsync({
        type: AgentEvent.AgentMessage,
        sessionId: "benchmark-session",
        timestamp: Date.now(),
        payload: []
    });
});

// ---------------------------------------------------------
// 3. DataBlock Benchmark
// ---------------------------------------------------------

bench("DataBlock: Construction", () => {
    new DataBlock({
        sessionId: "bench-session",
        senderId: "user",
        targetId: "agent-main",
        type: "human",
        priority: MessagePriority.NORMAL,
        controlPayload: "Hello, how are you doing today?"
    });
});

const heavyPayload = "A".repeat(5000);

bench("DataBlock: Construction (5KB payload)", () => {
    new DataBlock({
        sessionId: "bench-session",
        senderId: "user",
        targetId: "agent-main",
        type: "human",
        priority: MessagePriority.NORMAL,
        controlPayload: heavyPayload
    });
});

const sampleBlock = new DataBlock({
    sessionId: "bench-session",
    senderId: "user",
    targetId: "agent-main",
    type: "human",
    priority: MessagePriority.NORMAL,
    controlPayload: "This is a sample payload for serialization benchmark."
});

bench("DataBlock: Serialize (toJSON)", () => {
    JSON.stringify(sampleBlock.toJSON());
});

bench("DataBlock: toMessage (LangChain conversion)", () => {
    sampleBlock.toMessage();
});

// ---------------------------------------------------------
// 執行跑分
// ---------------------------------------------------------
console.log("Running benchmarks...\n");
await run();
