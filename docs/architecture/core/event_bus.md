---
title: 事件總線與排程系統
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes: []
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
  - ../agent/task.md
---

# 事件總線與排程系統 (EventBus & Scheduler)

作為系統非同步運轉的核心樞紐，透過事件驅動架構 (Event-Driven Architecture) 提供高效的無阻塞訊息傳遞與任務調度。

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

---

## 3. 事件總線安全與異步增強 (EventBus Security & Async Enhancements)

為了支撐多用戶併發運行、避免進程因為異步錯誤崩潰，並提供高可靠的協作中樞，`EventBus` 進行了高階重構與安全增強：

### A. 會話安全隔離 (Session Isolation & Tenant Security)
*   所有發布的 `IEvent` 可選攜帶 `sessionId?: string`。
*   **隔離路由規則**：
    *   若事件攜帶 `sessionId`：`EventBus` 僅將事件分發給具有**相同 `sessionId`** 或者是**全局註冊（無限定 sessionId）**的監聽器。這能物理阻斷 Session A 的 Agent 竊聽 Session B 私密事件的可能性。
    *   若事件未攜帶 `sessionId`（全局公共事件）：派發給所有匹配該事件類型的訂閱者。

### B. 異步錯誤邊界防禦 (Async Promise Error Boundary)
*   當使用非同步的 `publish(event)` 廣播時，`EventBus` 在事件循環的 Check 階段執行監聽器。
*   **Promise Rejection 捕獲**：若監聽器是一個 `async` 函數，`EventBus` 會自動捕獲其返回的 `Promise` 的 `.catch()` 錯誤，防止任何 Unhandled Promise Rejection 拋出，確保系統核心進程的絕對健壯性。

### C. 非同步同步化協調 (`publishAsync`)
*   對於有嚴格因果關係的控制事件（例如任務完成後必須等待日誌寫入完成），提供 `publishAsync(event): Promise<PromiseSettledResult<any>[]>` 介面。
*   `EventBus` 會使用 `Promise.allSettled` 同步等待所有異步訂閱者的處理程序全部執行完畢，並傳回各自的狀態。這既保障了因果時序的同步性，又不會因為單一訂閱者的拋錯而中斷整個廣播鏈。

### D. 宣告式訂閱與溫啟動喚醒 (Declarative Subscription & Wakeup)
*   事件總線支援傳入 `IDeclarativeSubscriber = { sessionId, agentId }` 進行宣告式訂閱。
*   **喚醒中樞**：當 Agent 處於持久化休眠狀態時，該訂閱會持久化保存於會話目錄下。事件觸發時，`EventBus` 會發送喚醒訊號給 `SessionManager`，推動其重組恢復該 Agent 節點並投遞事件 DataBlock。

### E. 全局通配符型別安全
*   為 `subscribe('*')` 提供了專屬的強型別簽名，保證全域 Logger、Metrics 收集器在不使用 `as any` 強轉的情況下，順利通過嚴格的 TypeScript 編譯校驗。
