---
title: 圖譜記憶管理 (Graph Memory)
version: 0.1.0
status: APPROVED
last_updated: 2026-08-03
author: Antigravity & User
related_codes: []
related_docs:
  - ../core/memory.md
---

# 圖譜記憶 (Graph Memory)

本文件定義 SuperNova 系統中跨會話的「長期記憶 (Long-term Memory)」架構。我們採用**圖向量混合架構 (Hybrid Graph-Vector)**，將記憶提煉為帶有實體邏輯關係與情緒權重的三元組。

## 1. 核心資料結構 (Data Models)

### A. GraphNode (實體節點)
代表一個實體（如人、概念、專案）。
- `id`: 唯一識別 (e.g., `User:Yan`)
- `label`: 節點標籤 (e.g., `Person`, `Concept`)
- `memory`: 詳細文本描述 (供 Vector Embedding 使用)
- `embedding`: 向量表示
- `properties`: 動態屬性字典

### B. GraphEdge (關聯邊)
代表實體之間的邏輯或情緒關聯。
- `id`: 邊的唯一識別
- `sourceId` / `targetId`: 連結的兩個節點
- `relation`: 關係動詞 (e.g., `LIKES`, `TRUSTS`)
- `weight`: 關係權重或情緒強度 (0.0 ~ 1.0)
- `properties`: 附加屬性 (如時間戳、衰減參數)

## 2. 儲存庫介面 (`IGraphRepository`)

為了解耦具體的資料庫（如 Vectra、SQLite 或 Neo4j），系統定義了 `IGraphRepository` 介面，繼承自基礎 `IRepository<GraphNode>`。

- **節點操作**: `addNode`, `updateNode`, `getNode`, `deleteNode`
- **邊操作**: `addEdge`, `updateEdge`, `getEdgesBySource`, `getEdgesByTarget`, `deleteEdge`
- **檢索操作**:
  - `searchNodesByVector`: 透過向量尋找相近實體。
  - `getSubgraph`: 透過中心節點 ID 展開星狀周邊圖譜，擷取高關聯性的上下文。

## 3. 情緒與沉澱機制
- **事件驅動沉澱**: 透過 EventBus 在會話結束時非同步觸發 `MemoryAgent` 提煉 `history.jsonl`，轉換為三元組寫入圖譜，不阻塞前台運作。
- **情緒權重邊**: 結合 MainAgent 的 OCC 情緒引擎，邊緣權重會隨外部事件（如任務成功、失敗）即時調整，賦予 Agent 長期的人格連續性。
