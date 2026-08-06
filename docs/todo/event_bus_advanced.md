---
title: EventBus 進階功能規劃
version: 0.1.0
status: DRAFT
last_updated: 2026-08-06
---

# EventBus 進階功能規劃

> **[TODO]** 以下為 EventBus 已規劃但尚未實現的進階功能。

## 行為 2 TTL 監控防死鎖
內建超時監控機制，若任務逾時，排程器將主動生成 `TimeoutError DataBlock` 並透過 `EventBus` 喚醒負責的 Agent，確保 PDCA 循環不會永久掛起。

## 底層工具 API 邊界 (Tools Interface)
系統為 `Agent` 提供以下狀態原語 (Tools) 作為與底層組件互動的介面：
1. **`query_oplog(filter_tags)`**：主動撈取歷史操作軌跡，用於 Check 階段的狀態比對。
2. **`patch_task_graph(modifications)`**：在 Act 階段動態增刪改已存在的任務節點與依賴關係。
