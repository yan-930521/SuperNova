---
title: 會話與工作階段管理
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes: []
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
  - ./memory.md
---

# 會話與工作階段管理 (Session & Thread Management)

負責系統級會話生命週期、多租戶隔離、人機協同中斷與狀態時間旅行。

## 1. 核心概念

在工業級的 Agent 執行環境中，單次的請求-回應是不夠的。我們引入 `Session` 與 `Thread` 兩層抽象來組織長週期的 Agent 協作：

*   **`Session` (會話 / 任務階段)**：**代表一個與 `MainAgent` 的新對話**。當用戶發起新對話時，即建立一個獨立的 Session。所有由此對話中衍生派生出的 `SubAgent` 與 `Worker` 都強制依附於此 Session 中運行，共享同一個 `sessionId`，以實現生命週期與資源邊界的嚴格綁定。
*   **`Thread` (執行緒 / 分支對話)**：一個 Session 下的特定討論分支或並行任務。例如在修復 bug 時，創建一個 Thread 用於「分析程式碼」，另一個 Thread 用於「寫單元測試」。

---

## 2. 狀態機與生命週期 (Session Lifecycle)

每個 Session 都有其明確的生命週期狀態 (`SessionState`)：

*   **`ACTIVE`**：會話處於活躍狀態，Agents 與 Workers 正在並發執行。
*   **`SUSPENDED` (掛起)**：系統在優雅停機或維護時主動凍結的狀態。此時所有活躍 Agent 均已脫水（Dehydrate）寫入存檔，重啟後可透過恢復流自動還原執行。
*   **`INTERRUPTED` (人機協同掛起)**：遭遇高危操作或資訊不足，Session 被掛起並釋放記憶體，等待外部人類（HITL）點擊「同意」或給予反饋。
*   **`COMPLETED`**：任務順利達成，Session 歸檔。
*   **`FAILED`**：遭遇無法修復之嚴重錯誤、安全熔斷或工作空間毀損。
*   **`ARCHIVED` (封存)**：Session 長期閒置，狀態與 Workspace 被寫入持久儲存（如 Git / Database），從活躍記憶體中清除。當下一次有新訊息傳入時，會自動進行「溫啟動（Warm Start）」還原。

---

## 3. DataBlock 的 Session 綁定與時空旅行 (Time-Travel)

`DataBlock`（通用訊息載體）原生與 `sessionId` 及 `threadId` 綁定。

### A. 會話事件路由 (Session-based Event Routing)
`EventBus` 依據 `(sessionId, targetId)` 進行精準的事件傳遞。這確保了當多個用戶同時呼叫同一個 Agent 藍圖時，各自的事件不會混淆。

### B. 統一會話日誌與重播 (Session Replay)
*   整個 Session 的運行軌跡，就是按時間排序、攜帶該 `sessionId` 的所有 `DataBlock` 序列。
*   **時空旅行 (Time-Travel)**：當 Agent 出現邏輯偏差或執行失敗，管理員可以查閱該 Session 的 `DataBlock` 歷史，選擇將 Session 「倒帶」至某個特定的 `DataBlock` 產生的時間點，修改其中的變數或 Prompt 引導，然後重新沿著該時間點重啟執行。

### C. 運行時時序插針投影 (Conversational Time-Travel Projection)
為了保留系統非同步事件與對話之間的「因果時效性（Temporal Causality）」，同時避免 Agent 上下文被海量日誌垃圾污染，系統在運行時動態將 `DataBlock` 投影為對話 Message：
*   **底層解耦**：資料庫與磁碟存檔中，對話歷史 (`messages`) 與 `DataBlock` 暫存 (`inboxBuffer`) 徹底分離，確保數據結構的職責單一與 Clean Design。
*   **動態插針**：控制面在組裝 LLM 上下文時，會讀取這兩股資料流，並根據 `DataBlock.timestamp` 時間戳，將 DataBlock 動態轉化為對應角色（`role: block.type`）的 Message，並**「插針」**嵌入到對話歷史的正確時序點上。
*   **角色分流渲染 (LangChain BaseMessage 投影)**：
    *   `type: 'system'` (系統事實) $\rightarrow$ `toMarkdown()` 輸出包含事件意圖、發送者與指標的結構化 Markdown 系統事實，並在 `toMessage()` 中實例化為 LangChain `SystemMessage`。
    *   `type !== 'system'`（如 `'message'` 或 `'tool'`） $\rightarrow$ `toMarkdown()` 直接輸出其 `controlPayload` 原始資料（若為字串則直接返回，若為物件則返回其完整 JSON 序列化字串，不做任何欄位過濾與裝飾），並在 `toMessage()` 中實例化為對應的 LangChain `HumanMessage` 或 `ToolMessage` (自動配對 `tool_call_id`)。

---

## 4. 資源與多租戶隔離 (Multi-Tenancy & Resource Isolation)

透過 Session 機制，底層的記憶體與工作區管理將進行更精細的劃分：

1.  **工作區路由**：`WorkspaceManager` 建立的目錄（實體 Git 目錄或 VFS 虛擬檔案系統）不再僅以 `agent_id` 命名，而是組織在 `{base_dir}/sessions/{sessionId}/{threadId}/` 之下，實作徹底的物理隔離。
2.  **垃圾回收 (VFS Session GC)**：當 Session 進入 `COMPLETED` 或 `FAILED` 時，底層虛擬檔案系統中掛載在該 `sessionId` 下的所有記憶體暫存資源將會被一次性徹底銷毀，釋放伺服器記憶體。
3.  **Token 累計與計費**：`BaseAgent` 的 `recordUsage` 可以將計量資訊回報至 Session 級別，從而實現單一 Session 或 Thread 的精準成本核算。

---

## 5. 人機協同閘道 (HITL Session Gateway)

當 `BaseAgent` 的子類別（如 `SubAgent`）需要人類確認時（例如調用高危工具）：

1.  Agent 調用系統 API 發佈 `INTERRUPT` 類型的 `DataBlock`。
2.  `SessionManager` 捕獲此事件，將該 Session 狀態變更為 `INTERRUPTED`，並呼叫 `saveState()` 將當前狀態序列化存檔，隨後釋放相關 Agent 與 Worker 實例。
3.  外部 UI / API 接收到待審批通知。
4.  人類審批通過（或提供反饋內容）後，外部系統向 `SessionManager` 送入一個 `RESUME` 訊號。
5.  `SessionManager` 依據 `sessionId` 反序列化還原 Agents，將審批結果包裝為 `DataBlock` 塞入 Agent 收件箱，Agent 恢復 BUSY 狀態繼續運作。

---

## 6. 系統重啟恢復流與容錯 (System Recovery Flow & Fault-Tolerance)

當 SuperNova Runtime 啟動引導 (`Kernel.start()`) 時，`SessionManager` 將自動執行會話恢復流程，以確保系統斷電或重啟後的自愈能力：

1.  **歷史狀態掃描**：
    `SessionManager` 掃描配置的會話儲存根目錄，讀取所有歷史 `session.json`。
2.  **目標恢復會話篩選**：
    篩選出狀態為 `ACTIVE` 或 `SUSPENDED` 的會話資料。
3.  **Workspace 容錯驗證 (Fault-Tolerance Policy - 方案 B)**：
    *   **健康會話**：若該會話對應的 Workspace 目錄完整且健康，調用 `WorkspaceManager.initWorkspace(sessionId)` 恢復掛載儲存驅動，通知 `AgentManager` 透過 ID 召回（Rehydrate）其 `MainAgent` 實例，重組 TaskDAG 以重啟執行。
    *   **損毀會話**：若偵測到該會話的 Workspace 物理目錄遺失、損毀或發生 Git 損壞，**系統採取容錯跳過策略**：
        *   將該會話在磁碟中的 `session.json` 狀態強制更新標記為 `FAILED`。
        *   在系統日誌中發布 `WARNING` 級別的日誌，警告管理員該 Workspace 已毀損。
        *   **不拋出致命例外阻礙 Boot，而是跳過該會話，繼續引導恢復其他健康的會話**，保障 Runtime 內核的全局高可用性。

4.  **與儲存基礎設施解耦**：
    `SessionManager` 內部的檔案掃描與加載操作已完全委託給 `ISessionRepository` 完成，其自身不直接依賴任何本機 `fs` 或物理路徑，具備優良的單元測試隔離性。

---

## 7. 資料持久化與 Repository 模式 (Data Persistence & Repository Pattern)

為了解耦高層業務控制面與底層物理檔案系統，系統引入了 **Repository（倉儲）模式**，規範了會話狀態與事件歷史的物理存檔拓撲。

### A. 物理存檔目錄結構
所有與特定 `sessionId` 關聯的元數據、對話歷史與代理人快照，一律物理收攏在會話的專屬目錄下，實現徹底的多租戶物理隔離：

```text
workspace/
└── session/
    └── <sessionId>/
        ├── session.json                   # ISessionRepository 儲存的會話元數據 (SessionData)
        └── agents/                        # Agent 專屬實體隔離目錄
            ├── <agentId_A>/
            │   ├── state.json             # IAgentStateRepository 儲存的狀態快照
            │   └── history.jsonl          # IDataBlockRepository 儲存的歷史紀錄
            └── <parentAgentId>/           
                ├── state.json             # 獨立模式狀態快照
                ├── state_<cloneId>.json   # 分身模式下的隔離狀態快照
                └── history.jsonl          # 歷史紀錄
```

### B. 會話元數據儲存 (`ISessionRepository`)
*   **介面特點**：繼承自通用 `IRepository<Session>` 介面，提供標準的 CRUD 方法（`save`、`load`、`delete`、`exists`、`list`）。
*   **行為機制**：
    *   `save` 時，將 Session 實體序列化為 `SessionData` JSON 保存。
    *   `load` 時，利用 `Session.fromJSON()` 反序列化還原。

### C. 訊息與對話歷史儲存 (`IDataBlockRepository`)
*   **介面特點**：繼承自 `IRepository<DataBlock>` 泛型，同時擴充專屬的高效讀寫 API。
*   **物理格式優勢 (JSON Lines / JSONL)**：
    每一行代表一個獨立 JSON 化的 `DataBlock` 記錄。在寫入時無須讀取舊檔，直接以常數時間 $O(1)$ 的 `fs.appendFile` 追加寫入，極大地降低了高頻事件與長對話下的磁碟 I/O 損耗。
*   **Agent 級別物理隔離**：
    歷史事件會依據參與的 Agent ID 隔離分檔為 `agents/{agentId}/history.jsonl`。讀取特定 Agent 歷史時，無須掃描其他無關 Agent 的歷史，讀取效能極佳。
*   **核心介面 API**：
    1.  `saveForAgent(sessionId, agentId, blocks)`：整份覆寫該 Agent 的歷史（用於時空旅行倒帶）。
    2.  `appendForAgent(sessionId, agentId, block)`：以 $O(1)$ 常數時間向 `history.jsonl` 追加單筆 DataBlock。
    3.  `findByAgent(sessionId, agentId)`：讀取並逐行反序列化解析 `history.jsonl`，還原為強型別 `DataBlock[]`。
*   **集中式派發與存檔 (Mediator-Driven Save & Dispatch)**：
    `BaseAgent` 本身不直接訂閱 `EventBus` 的收件匣事件。收發與存檔職責統一收攏至 `SessionManager` (集中式中介者模式)。當 `EventBus` 廣播 `AgentMessage` 時，`SessionManager` 負責攔截，先客觀寫入發送者與接收者的 `history.jsonl` (Oplog)，接著將新訊息推入會話級的 `Session.inboxBuffer` 中。最後，若目標 Agent 處於 `IDLE` 或 `SUSPENDED` 狀態，則主動將信件抽出並呼叫 `agent.resume(messages)` 喚醒它。若為 `BUSY` 則信件保留於 Session 中，絕不漏接。

### D. 代理人狀態儲存 (`IAgentStateRepository`)
*   **介面特點**：繼承自通用 `IRepository<BaseAgentData>` 介面。
*   **無狀態與去贅肉設計 (No Inbox inside Agent)**：
    Agent 內部**不維護任何 inbox 記憶體陣列**。收件箱資料的流轉與持久化完全交給 `SessionManager` 與 `EventBus` 協同維護。這使得 `BaseAgentData` 無須序列化緩存 inbox，極大地減輕了 Agent 掛起與溫啟動的磁碟 I/O 開銷，保證了 Agent 的輕量與高可用性。
*   **二階定址強語意 API**：
    1.  `saveAgentState(sessionId, agentId, state, options)`：將 Agent 狀態（`BaseAgentData`）保存至 `{sessionId}/agents/{parentAgentId}/` 目錄下。若為分身（isClone），則自動命名為 `state_${cloneId}.json`，防止併發快照互相覆蓋。
    2.  `loadAgentState(sessionId, agentId, options)`：讀取並反序列化該 Agent 的狀態數據。
*   **Repository 物理細節封裝**：
    `BaseAgent` 本身僅傳入 `sessionId` 與 `agentId` 進行狀態存取，不再涉及任何本機 `fs` 或路徑拼接代碼，完美達成了高低層依賴解耦。

