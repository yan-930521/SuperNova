---
title: 圖譜記憶管理 (Graph Memory)
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes:
  - src/core/memory/MemoryManager.ts
  - src/core/memory/prompt.ts
related_docs:
  - ../core/memory.md
---

# 圖譜記憶 (Graph Memory)

本文件定義 SuperNova 系統中跨會話的「長期記憶 (Long-term Memory)」架構。我們採用圖譜記憶架構，將記憶提煉為帶有實體邏輯關係的三元組。

## 1. 核心資料結構 (Data Models)

### A. MemoryNode (實體節點)
代表一個實體（如人、概念、專案）。
- `id`: 唯一識別 (e.g., `Entity:User`)
- `label`: 節點標籤 (e.g., `Entity`)
- `memory`: 詳細文本描述 (供實體名稱記錄使用)
- `properties`: 動態屬性字典
- `createdAt`: 建立時間戳記
- `updatedAt`: 更新時間戳記

### B. MemoryEdge (關聯邊)
代表實體之間的邏輯關聯。
- `id`: 邊的唯一識別
- `sourceId` / `targetId`: 連結的兩個節點
- `relation`: 關係動詞 (e.g., `likes`, `works_at`)
- `properties`: 附加屬性 (如 `sourceContext` 來源對話上下文)
- `createdAt`: 建立時間戳記
- `updatedAt`: 更新時間戳記

## 2. 儲存庫介面 (`IGraphRepository`)

為了解耦具體的資料庫（如 SQLite 或 Neo4j），系統定義了 `IGraphRepository` 介面。

- **節點操作**: `addNode`, `updateNode`, `getNode`, `deleteNode`
- **邊操作**: `addEdge`, `updateEdge`, `getEdgesBySource`, `getEdgesByTarget`, `deleteEdge`
- **查詢選項**: 提供 `MemoryQueryOptions` 介面，以支援檢索圖譜時的進階查詢參數設定。

## 3. 記憶沉澱機制與防護設計

- **事件驅動沉澱**: 透過 EventBus 在背景攔截對話 (`handleAgentMessage`)，當未萃取記憶到達閾值 (`memory_extract_threshold`) 時，自動喚醒 `MemoryManager` 進行提煉。
- **萃取狀態標記**: 萃取完成後，系統會修改 `DataBlock` 的 `isExtracted = true` 屬性，並覆寫回儲存庫以避免重複萃取。
- **防重入保護機制**: 使用 `extractingSessions` Set 來追蹤目前正在進行萃取的 Session ID，有效防止針對同一個 Session 的重複背景萃取觸發。
- **提示詞模板**: 透過 `prompt.ts` 內的 `GRAPH_EXTRACTOR_PROMPT` 來約束 LLM 擷取具體的實體關係，並使用 `SESSION_SUMMARY_PROMPT` 來產生高層次的對話總結。

## 4. 核心記憶機制與 Feature Flags

這些進階功能可以透過 `Config.ts` 中的布林值進行開關，以適應輕量或重度會話。
- **記憶圖譜萃取 (`enable_graph_memory`)**：決定是否使用 LLM 結構化輸出在背景提煉對話為三元組。
- **超大文本自動卸載 (`enable_payload_offload`)**：攔截幾萬字的超大上下文，轉為 `DataPointer`，保護系統記憶體不被撐爆。
- **多代理人遍歷 (Multi-Agent Support)**：在上述所有萃取與總結過程中，`MemoryManager` 會主動向 Repository 查詢 (`listAgentsForSession`)，遍歷處理該 Session 下所有的子分身與主腦，不遺漏任何 Agent 的歷史。

> 關於換日邏輯 (`handleTick`) 與巨觀情境記憶的機制，已獨立抽離至 [每日總結與情景記憶 (daily_summary.md)](daily_summary.md)。

> 進階功能規劃（向量嵌入、進階圖譜查詢、情緒權重動態調整）請參閱 [圖譜記憶進階規劃](../../todo/graph_memory_advanced.md)。
