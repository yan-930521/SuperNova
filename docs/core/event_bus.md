# 事件總線與排程系統 (EventBus & Scheduler)

取代傳統的死迴圈與輪詢 (Polling)，負責系統的非同步運轉。

## 核心組件

### `EventBus` (事件總線)
*   **職責**：處理非同步通訊、訊息路由 (Message Routing) 與事件中斷喚醒機制 (Interrupt-Driven Wakeup)。
*   **行為**：接收來自 `Worker` 或 `Agent` 封裝的 `DataBlock`，根據其夾帶的**目標 ID (Target ID)** 進行精準路由，轉發至對應節點的 `InboxBuffer`，並發送中斷信號喚醒目標。支援設定喚醒顆粒度 (如 `WaitMode: ALL / ANY`)，避免目標被頻繁無效喚醒 (Thrashing)。

### `DAGScheduler` (任務拓撲排程器)
*   **職責**：託管並執行 Agent 生成的 `TaskDAG`。
*   **行為**：
    1. **依賴解析**：自動解析任務依賴 (如 A 完成才能執行 B)，並行或循序派發 `Worker`。
    2. **TTL 監控防死鎖**：內建超時監控機制，若任務逾時，排程器將主動生成 `TimeoutError DataBlock` 並透過 `EventBus` 喚醒負責的 Agent，確保 PDCA 循環不會永久掛起。

---

## 底層工具 API 邊界 (Tools Interface)
系統為 `Agent` 提供以下四大狀態原語 (Tools) 作為與底層組件互動的介面：
1.  **`create_task_graph(nodes, edges)`**：生成初始任務拓撲圖，並註冊至 `DAGScheduler`。
2.  **`dispatch_workers(wait_mode)`**：觸發 `EventBus` 開始派發任務，`Agent` 隨即掛起。
3.  **`query_oplog(filter_tags)`**：主動撈取歷史操作軌跡，用於 Check 階段的狀態比對。
4.  **`patch_task_graph(modifications)`**：在 Act 階段動態增刪改已存在的任務節點與依賴關係。
