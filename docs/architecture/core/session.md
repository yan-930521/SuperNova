---
title: 會話與工作階段管理
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes: 
  - ../../src/core/session/Session.ts
  - ../../src/core/session/SessionManager.ts
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
  - ./memory.md
---

# 會話與工作階段管理 (Session & Thread Management)

負責系統級會話生命週期、多租戶隔離、中斷與狀態時間旅行。

## 1. 核心概念

在工業級的 Agent 執行環境中，單次的請求-回應是不夠的。我們引入 `Session` 與 `Thread` 兩層抽象來組織長週期的 Agent 協作：

*   **`Session` (會話 / 任務階段)**：**代表一個與 `MainAgent` 的新對話**。當用戶發起新對話時，即建立一個獨立的 Session。所有由此對話中衍生派生出的 `TaskAgent` 與 `Worker` 都強制依附於此 Session 中運行，共享同一個 `sessionId`，以實現生命週期與資源邊界的嚴格綁定。
*   **`Thread` (執行緒 / 分支對話)**：一個 Session 下的特定討論分支或並行任務。例如在修復 bug 時，創建一個 Thread 用於「分析程式碼」，另一個 Thread 用於「寫單元測試」。

---

## 2. 狀態機與生命週期 (Session Lifecycle)

每個 Session 都有其明確的生命週期狀態 (`SessionState`)：

*   **`ACTIVE`**：會話處於活躍狀態，Agents s 正在並發執行。
*   **`SUSPENDED` (掛起)**：系統在優雅停機或維護時主動凍結的狀態。此時所有活躍 Agent 均已脫水（Dehydrate）寫入存檔，重啟後可透過恢復流自動還原執行。
*   **`INTERRUPTED` (人機協同掛起)**：人機協同掛起中，等待外部審批或使用者反饋。
*   **`COMPLETED`**：任務順利達成，Session 歸檔。
*   **`FAILED`**：遭遇無法修復之嚴重錯誤、安全熔斷或工作空間毀損。
*   **`ARCHIVED` (封存)**：已歸檔（長期閒置，記憶體釋放，可隨時重新溫啟動）。

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

### D. 意識投影狀態管理 (Projection State Management)
*   **狀態歸屬**：代理人之間的接管關係 (例如 `MainAgent` 意識投影到 `EmbodiedAgent`) 屬於會話層級的環境脈絡。因此，投影的連結元數據 (`metadata.projections`) 儲存於 `Session` 實體中，而非 Agent 本身。這確保了系統斷電重啟後，接管狀態能隨會話 (Dehydrate -> Rehydrate) 無縫還原。
*   **動態攔截與組裝**：`SessionManager` 監聽 `ProjectionToggled` 事件並自動更新會話狀態。在進行 `dispatchInboxForAgent` 派發信件時，若發現目標大腦正在投影，將動態喚醒軀殼，並當場組裝出無狀態的中介層 `ProjectionHandler` 來接管執行流，達成了 Agent 實體間的絕對解耦。

---

## 4. 資源與多租戶隔離 (Multi-Tenancy & Resource Isolation)

透過 Session 機制，底層的記憶體與工作區管理將進行更精細的劃分：

1.  **工作區路由**：`WorkspaceManager` 建立的目錄（實體 Git 目錄或 VFS 虛擬檔案系統）不再僅以 `agent_id` 命名，而是組織在 `{base_dir}/sessions/{sessionId}/{threadId}/` 之下，實作徹底的物理隔離。
2.  **Token 累計與計費**：`BaseAgent` 的 `recordUsage` 可以將計量資訊回報至 Session 級別，從而實現單一 Session 或 Thread 的精準成本核算。

---

## 5. 系統重啟恢復流 (System Recovery Flow)

當 SuperNova Runtime 啟動引導 (`Kernel.start()`) 時，`SessionManager` 將自動執行會話恢復流程，以確保系統斷電或重啟後的自愈能力：

1.  **歷史狀態掃描**：
    `SessionManager` 掃描配置的會話儲存根目錄，讀取所有歷史 `session.json`。
2.  **目標恢復會話篩選**：
    篩選出狀態為 `ACTIVE` 或 `SUSPENDED` 的會話資料。
3.  **與儲存基礎設施解耦**：
    `SessionManager` 內部的檔案掃描與加載操作已完全委託給 `ISessionRepository` 完成，其自身不直接依賴任何本機 `fs` 或物理路徑，具備優良的單元測試隔離性。

---

## 6. 資料持久化與 Repository 模式 (Data Persistence & Repository Pattern)

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
            └── <agentId_B>/           
                ├── state.json             
                └── history.jsonl          
```

### B. 會話元數據儲存 (`ISessionRepository`)
*   **介面特點**：繼承自通用 `IRepository<Session>` 介面，提供標準的 CRUD 方法（`save`、`load`、`delete`、`exists`、`list`）。
*   **行為機制**：
    *   `save` 時，將 Session 實體序列化為 `SessionData` JSON 保存。
    *   `load` 時，利用 `Session.fromJSON()` 反序列化還原。

### C. 訊息與對話歷史儲存 (`IDataBlockRepository`)
*   **介面特點**：繼承自 `IRepository<DataBlock>` 泛型，同時擴充專屬的高效讀寫 API。
*   **雙向同步快取 (In-Memory Cache)**：
    為了解決頻繁對話與平行投影代理產生的磁碟 I/O 瓶頸，實作層 (`FileSystemDataBlockRepository`) 內建了以 `sessionId:agentId` 為鍵值的 LRU 記憶體快取。讀取操作「零 I/O」且回傳淺拷貝 (Shallow Copy) 防止外部污染；寫入與覆寫則採用雙向同步更新，讓代理人在頻繁調閱 Oplog 時達到極致效能。
*   **物理格式優勢 (JSON Lines / JSONL)**：
    每一行代表一個獨立 JSON 化的 `DataBlock` 記錄。在寫入時無須讀取舊檔，直接以常數時間 $O(1)$ 的 `fs.appendFile` 追加寫入，極大地降低了高頻事件與長對話下的磁碟 I/O 損耗。
*   **Agent 級別物理隔離**：
    歷史事件會依據參與的 Agent ID 隔離分檔為 `agents/{agentId}/history.jsonl`。讀取特定 Agent 歷史時，無須掃描其他無關 Agent 的歷史，讀取效能極佳。
*   **核心介面 API**：
    1.  `saveForAgent(sessionId, agentId, blocks)`：整份覆寫該 Agent 的歷史（用於時空旅行倒帶）。
    2.  `appendForAgent(sessionId, agentId, block)`：以 $O(1)$ 常數時間向 `history.jsonl` 追加單筆 DataBlock。
    3.  `findByAgent(sessionId, agentId)`：讀取並逐行反序列化解析 `history.jsonl`，還原為強型別 `DataBlock[]`。
*   **統一喚醒與批次管線化併行 (Unified Wakeup & Pipelined Batch Dispatch)**：
    `BaseAgent` 本身不直接訂閱 `EventBus` 的收件匣事件。收發與存檔職責統一收攏至 `SessionManager` (集中式中介者模式)。為達極致效能，`AgentMessage` 支援一次接收 `DataBlock[]` 陣列，`SessionManager` 會對陣列進行批次處理：
    1. **並行卸載**：透過 `Promise.all` 將所有大型字串併發卸載。
    2. **寫入去重與批次 I/O**：使用 `Set` 去重 Sender 與 Target，將所有的歷史 Oplog (`appendForAgent`) 收集後進行一次性的 `Promise.all` 管線化併發寫入，並保證背景壓縮 (`compactAgentHistory`) 每個 Sender 僅觸發一次。
    3. **收斂喚醒**：將訊息安靜地推入 Inbox 後，每個目標 Agent 僅會被喚醒 (`dispatchInboxForAgent`) 一次，徹底解決陣列訊息派發導致的重複喚醒與資源競爭問題。
*   **全域唯讀檢查 (Global Peek Filter) 與統一喚醒**：
    在進行派發時，`SessionManager` 會嚴格檢查 `AgentState.BUSY`，若 Agent 正在執行則信件安全保留於 Inbox。同時為了避免意識分裂與並發衝突，新增了 `hasAnyActionableMessages` 全域檢查。只要 Agent 的信箱中包含任何一筆具行動價值的信件，就會透過 `popAllFromInbox` 一次性取出所有不同來源的信件，並進行 **「統一喚醒 (Unified Wakeup)」**，讓 Agent 的單一意識能在單次思考中總攬全局，不再發生舊架構下按發送者分流導致的多重宇宙與記憶錯亂問題。而 Agent 生成的回覆，也會預設轉換為針對該 Session 的 **「會話廣播 (Broadcast)」** (`targetId: null`)。
*   **彈性廣播與私訊混用 (Flexible Hybrid Communication)**：
    得益於「統一喚醒」與系統提示詞 (`COMMUNICATION_PROTOCOL`) 的結合，Agent 在處理多方訊息時具備了高級的情境判斷能力。當接收到多名用戶的並發請求時，LLM 能夠自行判斷：若請求涉及隱私或有明確一對一指定，它會主動調用 `send_message` 工具進行私訊；若是一般性閒聊或公開問題，則會直接輸出文字，整合為單一廣播訊息。這種混合模式大幅提升了多使用者場景下的自然度與 Token 效率。

### D. 代理人狀態儲存 (`IAgentStateRepository`)
*   **介面特點**：繼承自通用 `IRepository<BaseAgentData>` 介面。
*   **無狀態與去贅肉設計 (No Inbox inside Agent)**：
    Agent 內部**不維護任何 inbox 記憶體陣列**。收件箱資料的流轉與持久化完全交給 `SessionManager` 與 `EventBus` 協同維護。這使得 `BaseAgentData` 無須序列化緩存 inbox，極大地減輕了 Agent 掛起與溫啟動的磁碟 I/O 開銷，保證了 Agent 的輕量與高可用性。
*   **二階定址強語意 API**：
    1.  `saveAgentState(sessionId, agentId, state)`：將 Agent 狀態（`BaseAgentData`）保存至 `{sessionId}/agents/{agentId}/` 目錄下的 `state.json` 中。無狀態併發機制保證了單一實體只需要一份狀態快照。
    2.  `loadAgentState(sessionId, agentId)`：讀取並反序列化該 Agent 的狀態數據。
*   **Repository 物理細節封裝**：
    `BaseAgent` 本身僅傳入 `sessionId` 與 `agentId` 進行狀態存取，不再涉及任何本機 `fs` 或路徑拼接代碼，完美達成了高低層依賴解耦。

> 進階功能規劃（HITL 閘道、Thread 分支合併、VFS GC、會話重播）請參閱 [會話進階功能規劃](../../todo/session_advanced.md)。
