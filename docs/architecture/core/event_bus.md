---
title: 事件總線與排程系統
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes: 
  - ../../../src/core/messaging/EventBus.ts
  - ../../../src/core/messaging/IBus.ts
  - ../../../src/core/messaging/DataBlock.ts
  - ../../../src/core/messaging/index.ts
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
---

# 事件總線與排程系統 (EventBus & Scheduler)

作為系統非同步運轉的核心樞紐，透過事件驅動架構 (Event-Driven Architecture) 提供高效的無阻塞訊息傳遞與任務調度。

## 核心組件

### `EventBus` (事件總線)
*   **職責**：處理非同步通訊、訊息路由 (Message Routing) 與事件中斷喚醒機制 (Interrupt-Driven Wakeup)。
*   **全局監聽**：支援 `subscribe('*')` 進行通配符訂閱，可用於全局監控與日誌收集，並享有完整的型別推導與安全。

### `DataBlock` (資料載體) 與 `DataPointer` 機制
*   所有事件與訊息的傳遞皆透過 `DataBlock` 進行封裝。
*   **Claim Check 模式**：為了避免龐大的資料（如長文本或檔案）塞爆記憶體或事件總線，系統實現了 **Claim Check 模式**。超大 Payload 會被卸載，並轉換為輕量級的 `DataPointer` 介面（支援 FILE, VFS, CACHE, URL）。這有效分離了「控制面」與「資料面」。

---

## 事件總線安全與異步增強 (EventBus Security & Async Enhancements)

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

### E. 全局事件對映表 (GlobalEventMap) 與泛型推導
*   為保證編譯期的極致型別安全，引入了 `GlobalEventMap` 模式，將所有 `SystemEvent`, `HookEvent`, 與 `AgentEvent` 與其專屬的 Payload 型別綁定。這構成了 `IBus` 的完整泛型型別系統。
*   發佈或訂閱事件時，只需傳入事件型別 (Type)，TypeScript 會自動推導並鎖定 `event.payload` 的型別，徹底消除了不安全的型別強轉 (Type Assertion)，保障執行期安全。

### F. 預定義事件分類與標籤 (Predefined Event Types & Labels)
為了提高型別安全性與程式碼可讀性，系統將事件劃分為三大列舉：

#### 預定義事件一覽表

| 事件分類 | 事件標籤 (Enum Value) | 說明與觸發時機 |
| :--- | :--- | :--- |
| **SystemEvent** | `SESSION_STARTED` | 新 Session 被成功建立並啟動時 |
| | `SESSION_CLOSED` | Session 被關閉或銷毀時 |
| | `SESSION_UPDATED` | Session 配置或狀態更新時 |
| | `SESSION_OPTIMIZATION` | 觸發 Session 記憶與狀態優化時 |
| | `TASK_CREATED` | 新任務被註冊到排程器時 |
| | `TASK_FINISHED` | 任務成功執行完畢時 |
| | `TASK_FAILED` | 任務執行失敗或逾時時 |
| | `SYSTEM_TICK` | 系統運行時心跳信號 |
| **HookEvent** | `BEFORE_TOOL_CALL` | 工具即將執行前 |
| | `AFTER_TOOL_CALL` | 工具成功執行並返還結果時 |
| | `ON_TOOL_ERROR` | 工具呼叫失敗並拋出異常時 |
| | `BEFORE_AGENT_STEP` | Agent 即將進入單步決策循環（PDCA）前 |
| | `AFTER_AGENT_STEP` | Agent 完成單步決策並更新狀態後 |
| | `ON_AGENT_ERROR` | Agent 內部決策或執行發生未捕獲錯誤時 |
| | `BEFORE_TASK_EXECUTE` | 任務即將開始執行前 |
| | `AFTER_TASK_EXECUTE` | 任務執行成功且結果已寫入快取時 |
| | `ON_TASK_ERROR` | 任務執行發生錯誤時 |
| **AgentEvent** | `AGENT_MESSAGE` | Agent 之間或與用戶傳遞訊息時 |
| | `AGENT_STATE_CHANGED` | Agent 內部狀態發生轉換時 |
| | `WORLD_UPDATED` | Agent 的世界觀認知更新時 |
| | `EMOTION_TRIGGERED` | 觸發內部情緒變化時 |
| | `PROJECTION_TOGGLED` | 啟用或關閉意識投影控制時 |

> 進階功能規劃（TTL 監控、工具 API、事件優先級、重播、背壓控制）請參閱 [EventBus 進階功能規劃](../../todo/event_bus_advanced.md)。
