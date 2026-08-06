---
title: Agent 進階功能規劃
version: 0.1.0
status: DRAFT
last_updated: 2026-08-06
related_docs:
  - ../architecture/agent/agent.md
---

# Agent 進階功能規劃

> **[TODO]** 以下功能為已規劃但尚未實現的 Agent 進階能力。

## 1. 代理層 PDCA 交互流程 (Data Flow)
*(以 `TaskAgent` 處理任務為例)*

1. **Plan (規劃)**
2. **Do (執行)**
   * `TaskAgent` 調用 `dispatch_workers(wait_mode="ALL")`，隨後進入非同步掛起，停止消耗 Token。
3. **Check (檢視)**
   * `EventBus` 將結果封裝為 `DataBlock` 送入 `InboxBuffer`，並喚醒 `TaskAgent`。
   * 若存在異常結果，`ContextManager` 自動觸發 Hot-Lock 鎖定現場。
4. **Act (修正與收尾)**
   * `TaskAgent` 調閱 Oplog 與 Buffer 內容，進行冷靜決策。
   * 若需修正，呼叫 `patch_task_graph` 動態增刪改 DAG 節點，重新進入 Do 循環。
   * 若任務完全成功，將最終狀態 Deep Merge 回 `MainAgent`。
   * **清理與閒置 (Lazy GC)**：系統解除該任務的 `Workspace` 與 `Oplog` 綁定 (執行嚴格的記憶擦除)，將該 `TaskAgent` 切換至 `IDLE` 狀態並啟動 TTL 倒數計時。若超時則執行最終實體銷毀。

---

## 2. 指令集與 Prompt 規範 (Prompt as ISA)
將 `Prompt` 視為驅動無形體 `TaskAgent` 的指令集。Prompt 中必須明確約定 PDCA 各個狀態的行為準則與嚴格約束：
*   **【DO 規範】**：拓撲圖就緒後，僅能下達並發指令並進入掛起狀態。
*   **【CHECK 規範】**：喚醒後，強制要求比對 `DataBlock` 與 `Oplog` 中的預期目標。嚴禁在此階段臆測外部狀態。
*   **【ACT 規範】**：遭遇錯誤時，依賴被鎖定的完整上下文進行反思，並調用修補工具；連續失敗超出上限則必須通報。

---

## 3. 高階擴展與併發模型 (Advanced Scaling Models)

為了解決大數據處理與巨型專案維護的擴展性瓶頸，系統支援兩種不同維度的 Agent 擴展模型：

### A. 樹狀派生模式 (主動派生 - Fractal Delegation)
*   **適用場景**：處理極度複雜、需要大量思考與拆解的單一巨型任務（例如：維護擁有 500 個模組的專案）。

### B. 無狀態併發模式 (被動擴展 - Stateless Auto-Concurrency)
*   **適用場景**：系統被動遭遇突發且大量的「同性質事件」（例如：Discord 機器人同時收到 100 人的詢問，或監控系統同時湧入 500 筆 Error Log）。
*   **運作機制**：這是依賴 `BaseAgent` 的無狀態化特性 (`Stateless Executor`) 所達成的完美水平擴展。當 `SessionManager` 從 Inbox 中抽取到多筆平行事件時，**不需要實體上複製或 Clone Agent**，而是直接將事件打包為多個 `messageBatches`，並在同一個 Agent 內部發起多次非同步的 `processInbox` 呼叫。由於每個呼叫都會動態抓取獨立的歷史記憶與上下文 (`ContextOverride`)，且不修改實體狀態，因此單一 Agent 即可瞬間處理無上限的併發請求。這完美實現了類似 Serverless 的極致效能與零擴容成本。

---

## 4. 跨會話事件訂閱與動態喚醒 (Cross-Session Event Subscription & Wakeup)

雖然在安全架構下「跨 Session 的資料絕對不流通」，但為了防範輪詢（Polling）造成的運算與 Token 浪費，EventBus 提供了跨會話的**系統事件訂閱與喚醒機制**：

*   **跨 Session 事件發佈**：當某個工作區或服務（如 Bob 的 Express API）成功啟動並通過健康檢查時，會向 EventBus 廣播一個公開的系統事件（例如：`SERVICE_STATUS_CHANGED`，攜帶 `{ serviceName: "bob-api", status: "UP" }`），此類事件不涉及私密資料。
*   **訂閱與掛起等待**：Alice 的 `TaskAgent` 在整合測試連線失敗時，可在 `[ACT]` 階段向 EventBus 註冊對該服務 `UP` 事件的訂閱，並主動進入**持久化休眠**（Dehydrate）。
*   **動態事件喚醒（Wakeup）**：當 Bob 的服務上線事件觸發時，EventBus 檢查訂閱表，向 Control Plane 傳送喚醒信號。Control Plane 透過 ID 召回（Rehydrate）Alice 的 `TaskAgent` 並投遞喚醒 DataBlock，推動其重試整合測試。這實現了零資源消耗的主動非同步通知。
