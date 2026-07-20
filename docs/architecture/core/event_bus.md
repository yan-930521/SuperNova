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
*   **行為**：接收來自 `Worker` 或 `Agent` 封裝的 `DataBlock`。系統統一使用 `AgentEvent.AgentMessage` 作為通用的高速公路頻道，EventBus 將根據 `DataBlock` 夾帶的**目標 ID (Target ID)** 進行精準尋址路由 (Addressed Routing)，只有符合的節點才會被喚醒接收（若 Target ID 為 null 則視為全局廣播），徹底解耦通訊頻道與尋址邏輯。

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

### F. 全局事件對映表 (GlobalEventMap) 與泛型推導
*   為保證編譯期的極致型別安全，引入了 `GlobalEventMap` 模式，將所有 `SystemEvent`, `HookEvent`, 與 `AgentEvent` 與其專屬的 Payload 型別（如 `DataBlock`）綁定。
*   發佈或訂閱事件時，只需傳入事件型別 (Type)，TypeScript 會自動推導並鎖定 `event.payload` 的型別，徹底消除了不安全的型別強轉 (Type Assertion)，保障執行期安全。

### G. 預定義事件分類與標籤 (Predefined Event Types & Labels)
為了提高型別安全性與程式碼可讀性，系統將事件劃分為兩大列舉：
1. **`SystemEvent` (系統事件)**：描述全域或 Session 級別的宏觀生命週期變化（如 Session 啟動/關閉、Task 最終完成/失敗、系統 Tick 等）。
2. **`HookEvent` (鉤子事件)**：描述 Agent、Task、Tool 在執行生命週期中的細粒度切面監聽點（Before / After / Error 鉤子）。

#### 預定義事件一覽表

| 事件分類 | 事件標籤 (Enum Value) | 說明與觸發時機 |
| :--- | :--- | :--- |
| **SystemEvent** | `SESSION_STARTED` | 新 Session 被成功建立並啟動時 |
| | `SESSION_CLOSED` | Session 被關閉或銷毀時 |
| | `SESSION_UPDATED` | Session 配置或狀態更新時 |
| | `TASK_CREATED` | 新任務被註冊到排程器時 |
| | `TASK_FINISHED` | 任務成功執行完畢時 |
| | `TASK_FAILED` | 任務執行失敗或逾時時 |
| | `SYSTEM_TICK` | 系統運行時心跳信號 |
| **HookEvent** | `BEFORE_TOOL_CALL` | Agent/Worker 準備呼叫特定的工具前 |
| | `AFTER_TOOL_CALL` | 工具成功執行並返還結果時 |
| | `ON_TOOL_ERROR` | 工具呼叫失敗並拋出異常時 |
| | `BEFORE_AGENT_STEP` | Agent 即將進入單步決策循環（PDCA）前 |
| | `AFTER_AGENT_STEP` | Agent 完成單步決策並更新狀態後 |
| | `ON_AGENT_ERROR` | Agent 內部決策或執行發生未捕獲錯誤時 |
| | `BEFORE_TASK_EXECUTE` | 任務即將發派給指定 Worker/Agent 執行前 |
| | `AFTER_TASK_EXECUTE` | 任務執行成功且結果已寫入快取時 |
| | `ON_TASK_ERROR` | 任務在 Worker 執行層面拋錯時 |
