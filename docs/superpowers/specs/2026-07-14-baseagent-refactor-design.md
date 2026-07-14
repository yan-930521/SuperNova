# BaseAgent Refactoring Design

## 1. 概述 (Overview)
`BaseAgent` 的重寫目標是將其職責嚴格限縮為**「提供穩定的底層基礎設施與資源隔離」**，完全剝離具體的業務邏輯（如 PDCA 循環或與 LLM 的網路通訊）。所有 Agent（包含 `MainAgent`, `SubAgent`, `EmbodiedAgent`）都將繼承這個提供純粹生命週期與資源綁定的底層類別。

## 2. 核心架構與職責 (Architecture & Responsibilities)

重寫後的 `BaseAgent` 將負責以下三大核心領域：

### A. 資源與基礎設施綁定 (Infrastructure Binding)
`BaseAgent` 在建構時不再負責掛載 Workspace，而是將「運行日誌與防幻覺操作日誌 (Oplog)」強制導向**獨立的實體日誌目錄**，確保與 `WorkspaceManager` 完全解耦。
* **依賴注入 (DI)**：透過建構子注入 `EventBus` 等必要基礎組件。
* **專屬日誌 (Contextual Recorder)**：建立綁定 `agent_id` 的 `LogManager` 實例，並配置 `FileTransport` 寫入至 `{log_dir}/agents/{agent_id}/`。
* **收件箱 (InboxBuffer)**：為該 Agent 實例化專屬的訊息暫存區。
* **事件訂閱 (Event Subscription)**：自動向 `EventBus` 註冊監聽自己 `id` 的事件。收到 `DataBlock` 時推入 Inbox，並喚醒 Agent。

### B. 資源消耗輔助 (Usage & Token Tracking)
雖然 `BaseAgent` 不直接實例化 `LLMClient` 也不執行網路呼叫，但它提供資源消耗的統計介面，供子類別回報使用量。
* **UsageStats**：內部維護 Token 與執行時間等累積消耗。
* **記錄介面**：提供 `recordUsage(promptTokens, completionTokens, durationMs)` 讓子類別呼叫。
* **安全告警**：若累積使用量超出安全設定，會觸發 `logger.warn` 進行系統告警。

### C. 狀態持久化與存檔 (State Persistence)
`BaseAgent` 將內建狀態快照機制，確保系統中斷或重啟時能無縫還原，防止記憶遺失。
* **存檔方法**：提供 `saveState()` 與 `loadState()` 介面。
* **存檔內容**：包含當前的生命週期狀態 (`AgentState`)、Token 消耗量 (`UsageStats`)，以及允許子類別擴充的額外 Context 欄位。
* **自動存檔觸發點**：在狀態切換 (特別是進入 `SUSPENDED` 狀態) 前，自動呼叫 `saveState()` 寫入實體磁碟。
* **存檔位置**：與日誌目錄共用，直接寫入 `{log_dir}/agents/{agent_id}/state.json`。

### D. 純粹的生命週期管理 (Pure Lifecycle Management)
徹底拔除錯誤的 PDCA (`PLAN`, `DO`, `CHECK`, `ACT`) 狀態，回歸系統資源生命週期。
* **`AgentState` 枚舉**：
  * `INITIALIZING`: 建構與綁定基礎設施中。
  * `IDLE`: 就緒並等待事件。
  * `BUSY`: 正在處理業務邏輯 (子類別負責定義自己在忙什麼)。
  * `SUSPENDED`: 掛起中，主動釋放資源。
  * `TERMINATED`: 已安全銷毀。
* **狀態切換介面**：提供 `suspend()`, `resume(dataBlocks)`, `destroy()` 等方法控制狀態機與清理資源（如退訂 `EventBus`）。

## 3. 被抽離的職責 (Removed Responsibilities)
下列原本定義於 `BaseAgent` 的機制，將明確下放給子類別：
* **PDCA 循環與抽象方法**：`plan()`, `do()`, `check()`, `act()` 移交至 `SubAgent` 實作。
* **熔斷機制 (Circuit Breaker)**：`consecutiveErrors` 的計算與因修補失敗引發的熔斷，屬於任務排錯邏輯，移交至 `SubAgent` 實作。
* **LLM 網路連線**：大語言模型的連線建立、Prompt 組合與 API 呼叫，由各子類別依照自身需求實作。

## 4. 測試策略 (Testing)
* **基礎設施隔離測試**：利用 Mock `EventBus` 確保 `BaseAgent` 初始化時有正確訂閱，且 `destroy()` 時有正確退訂。
* **狀態機驗證**：測試 `suspend()` 與 `resume()` 呼叫是否能正確切換 `AgentState` 並觸發相應的日誌記錄。
* **Token 統計驗證**：呼叫 `recordUsage` 後，確認內部統計數值正確累加並能觸發閾值告警。
