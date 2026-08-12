# SuperNova 效能實測報告 (Performance Benchmark)

本文件記錄 SuperNova 核心基礎設施的效能測試結果。

**測試環境**：12th Gen Intel(R) Core(TM) i5-1240P / Windows 11 / Bun 1.3.14

---

## 執行方式

```bash
# 核心吞吐量測試（LRUCache、EventBus、DataBlock）
bun run bench:core

# OOM 防禦壓測（10 萬筆 × 5KB 巨量歷史寫入）
bun run bench:oom
```

---

## 1. 核心吞吐量 (Core Throughput)

測試工具：[mitata](https://github.com/evanwashere/mitata)

### 測試項目

| 類別 | 測試名稱 | 說明 |
|:---|:---|:---|
| **LRUCache** | Set & Evict (50-key) | 連續寫入 100 key 至容量上限 50 的快取，觸發淘汰 |
| **LRUCache** | Get (Hit / Miss) | 快取命中與未命中的讀取延遲 |
| **LRUCache** | Large (500-key) | 模擬 SkillManager 等級的大容量快取讀寫 |
| **EventBus** | Publish (1 / 10 subscribers) | 同步廣播至不同數量的訂閱者 |
| **EventBus** | PublishAsync | 非同步廣播，等待所有 handler resolve |
| **DataBlock** | Construction | 建構一筆標準訊息載體的耗時 |
| **DataBlock** | Serialize (toJSON) | 序列化為 JSON 的效能 |
| **DataBlock** | toMessage | 轉換為 LangChain Message 格式的耗時 |

### 測試結果

![Core Throughput Result](core.png)

### 數據摘要

#### LRUCache

| 測試 | 平均延遲 | 估算吞吐量 |
|:---|:---|:---|
| Set & Evict (50-key, 100 writes) | 60.17 µs / iter | ~0.60 µs/key |
| Get (Hit) | 290.80 ns | ~343 萬次/s |
| Get (Miss) | 1.94 ns | ~5.1 億次/s |
| Large (500-key) Get Hit | 761.66 ns | ~131 萬次/s |
| Large (500-key) Set & Evict | 50.23 µs / iter | ~0.50 µs/key |

- Large (500-key) Get Hit 比 50-key 版慢約 2.6 倍，存放的 value 為包含 200 字元字串的物件，V8 物件尋址開銷較純字串大。

#### EventBus

| 測試 | 平均延遲 | 估算吞吐量 |
|:---|:---|:---|
| Publish (sync, 1 subscriber) | 687.04 ns | ~145 萬次/s |
| Publish (sync, 10 subscribers) | 607.75 ns | ~164 萬次/s |
| PublishAsync (10 subscribers) | 6.52 µs | ~15.3 萬次/s |

- PublishAsync 與 sync 之間存在約 10 倍的延遲差距，源於 Promise 建立與 await 開銷。

#### DataBlock

| 測試 | 平均延遲 |
|:---|:---|
| Construction | 671.44 ns |
| Construction (5KB payload) | 639.08 ns |
| Serialize (toJSON) | 536.45 ns |
| toMessage (LangChain conversion) | 97.28 ns |

---

## 2. OOM 防禦壓測 (OOM Defense)

### 測試方法

向 `FileSystemDataBlockRepository` 灌入 **100,000 筆** 歷史對話，每筆 Payload 約 **5KB**，理論總記憶體壓力約 **500MB**。

### 測試結果

![OOM Defense Results](oom.png)

### 數據摘要

| 指標 | 數值 |
|:---|:---|
| 總寫入量 | 100,000 筆 × ~5KB |
| 理論記憶體壓力 | ~500 MB |
| 峰值 Heap | 506.91 MB (在 80,000 筆時) |
| 最終 Heap | 249.58 MB (寫完 100,000 筆後) |
| 總耗時 | 1.14 秒 |
| 吞吐量 | 87,712 msg/s |

#### 記憶體軌跡

```text
寫入量    10k     20k     30k     40k     50k     60k     70k     80k     90k    100k
Heap MB   94  →  196  →  249  →  300  →  300  →  404  →  404  →  507  →  198  →  250
                                                                  ↑ GC 回收
```

- 峰值出現在 80,000 筆（506.91 MB）。
- 在 90,000 筆時，V8 垃圾回收機制 (GC) 介入，將 Heap 驟降至 197.91 MB。
- **為何峰值會短暫超過理論值？** 在總耗時僅 1.14 秒的高極端吞吐量（87,712 msg/s）下，物件分配速度遠超 V8 啟動 GC 的預設頻率。系統防禦機制早已將舊物件參照釋放，但 V8 的惰性回收機制會等待記憶體壓力達到特定水位才執行大掃除。GC 觸發後的瞬間跌落證明了系統中不存在記憶體洩漏 (Memory Leak)。

#### 相關防禦機制

- **Payload Offloading**：超過閾值的字串卸載為 Blob 檔案，Prompt 中保留 `DataPointer`。
- **滑動視窗壓縮 (Sliding Window)**：掉出視窗的歷史紀錄壓縮落盤，搭配 `isOffloaded` 標記達成 O(1) 短路檢查。
- **LRUCache 容量上限**：淘汰時觸發 `onEvict` 進行資源回收。

---

## 歷史測試數據

| 日期 | 版本 | LRUCache Hit | EventBus Pub (1 sub) | OOM 峰值 | OOM 最終 | OOM 耗時 |
|:---|:---|:---|:---|:---|:---|:---|
| 2026-08-12 | v0.2.2 | ~291 ns | ~687 ns | ~507 MB | ~250 MB | ~1.14s |
