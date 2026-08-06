---
title: 圖譜記憶進階功能規劃
version: 0.1.0
status: DRAFT
last_updated: 2026-08-06
related_docs:
  - ../architecture/memory/graph_memory.md
---

# 圖譜記憶進階功能規劃

> **[TODO]** 以下為圖譜記憶系統已規劃但尚未實現的進階能力。

## 1. 向量嵌入與混合搜索 (Vector Embedding & Hybrid Search)
目前標題為「圖向量混合架構 (Hybrid Graph-Vector)」，但向量部分尚未實現：
*   `GraphNode.embedding` 屬性的實際賦值與使用
*   `searchNodesByVector`: 透過向量嵌入尋找語意相近的實體節點
*   整合外部向量資料庫（如 Vectra、Pinecone）進行相似度搜索

## 2. IGraphRepository 進階查詢
*   `getSubgraph`: 透過中心節點 ID 展開星狀周邊圖譜，擷取高關聯性的上下文
*   進階的邊過濾與路徑查詢操作

## 3. 情緒權重動態調整
目前 `GraphEdge` 的 `weight` 在儲存時未與 OCC 情緒引擎即時結合：
*   應結合 `MainAgent` 的情緒引擎，使邊緣權重隨外部事件即時調整
*   賦予 Agent 長期的人格連續性與情緒記憶

## 4. 超大文本自動卸載 (DataPointer Offloading)
針對記憶節點中的超大文本 payload：
*   攔截幾萬字的超大上下文，轉為 `DataPointer`
*   保護系統記憶體不被撐爆
*   與 `enable_payload_offload` Feature Flag 整合
