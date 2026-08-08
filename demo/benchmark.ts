import { bench, run } from 'mitata';

import { IEventBus } from '../src/core/domain/IBus';
import { EventBus } from '../src/core/messaging/EventBus';
import { AgentEvent } from '../src/core/domain/IBus';
import { LRUCache } from '../src/core/utils/LRUCache';

console.log("🚀 SuperNova Benchmark Runner");
console.log("===============================");

// ---------------------------------------------------------
// 1. LRUCache Benchmark
// ---------------------------------------------------------
// 模擬 README 中提到的上限 50 Key，確保快取基礎設施在極限寫入下不會造成 OOM
const cache = new LRUCache<string, string>(50);

bench("LRUCache: Set & Evict (Triggering eviction logic)", () => {
    // 故意連續寫入超過 50 的數量，強迫觸發滑動視窗/淘汰機制
    for (let i = 0; i < 100; i++) {
        cache.set(`key_${i}`, `value_${i}`);
    }
});

bench("LRUCache: Get (Hit)", () => {
    // 測量單純在記憶體命中快取的效能 (O(1) 的速度)
    cache.get("key_99"); 
});

// ---------------------------------------------------------
// 2. EventBus Benchmark
// ---------------------------------------------------------
// 模擬高併發派發：確保底層通訊架構不會成為 I/O 阻塞瓶頸
const bus = new EventBus();

// 註冊一個空的監聽者來模擬實際在運行的系統
bus.subscribe(AgentEvent.AgentMessage, () => {
    // No-op
});

bench("EventBus: High-frequency Publish", () => {
    bus.publish({
        type: AgentEvent.AgentMessage,
        sessionId: "benchmark-session",
        timestamp: Date.now(),
        payload: []
    });
});

// 開始執行跑分並印出專業的終端機報表
await run();
