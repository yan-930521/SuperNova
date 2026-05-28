# SuperNova 2.0 架構設計 (Architecture Design)

## 1. 核心哲學 (Core Philosophy)
SuperNova 2.0 採用 **「狀態分離與職責解耦」**。系統明確區分 **對話上下文 (Conversation State)** 與 **執行上下文 (Execution State)**，實現 Main Agent 與 任務引擎的深度分離，徹底解決長期運行中的 Context Drift (上下文漂移) 與 Goal Drift (目標偏移) 問題。

## 2. 雙層總帳架構 (Dual-Ledger Architecture)

### 2.1 會話層 (Session - Conversation Ledger)
- **定位:** 輕量級、面向對話的記錄器。
- **內容:** 儲存用戶原始目標、對話歷史及任務引擎回傳的高階狀態摘要 (`[Worker Observation]`)。
- **指派機制:** 當一個 Session 被建立時，系統會從 `AgentRegistry` 中選取一個 **MainAgent** 並與之綁定。該 MainAgent 成為該會話的首席負責人與用戶交互唯一窗口。
- **職責:** 負責維護與用戶的「溝通連貫性」，過濾掉不必要的底層執行細節。

### 2.2 任務層 (Task System - Execution Ledger)
- **定位:** 重量級、面向執行的詳細記錄器。
- **內容:** 
    - **內部思考軌跡 (Task History):** 紀錄單一任務中 Agent 的完整 ReAct 軌跡 (Thought -> Action -> Observation)，實現任務級別的記憶持久化。
    - **任務圖 (TaskGraph):** 節點狀態與依賴關係 (DAG)。任務完成後保留在圖中，狀態標記為 `COMPLETED`。
- **職責:** 負責維護「執行的可靠性與可溯源性」，驅動並行計算與自癒重規劃。

## 3. 核心技術協議 (Technical Protocols)

### 3.1 統一執行上下文 (IAgentExecuteContext)
為了確保全鏈路追蹤與「上下文隔離 (Context Isolation)」，所有代理執行與工具調用必須攜帶此上下文：
- `sessionId`: 關聯的會話 ID。
- `traceId`: 全鏈路追蹤 ID。
- `agentId`: 發起操作的代理 ID。
- `taskId`: 當前任務節點 ID (用於精準載入任務專屬歷史)。
- `retryCount` & `lastError`: 用於重試感知的錯誤歷史。
- `dependencyResults`: 自動注入前置任務的產出，解決任務間的資訊斷層。

### 3.2 遞歸編排模型 (Recursive Orchestration)
所有代理類（MainAgent, WorkerAgent）均繼承自 `BaseAgent` 並共用 `execute` 接口，且統一透過 **分層記憶提示詞 (Hierarchical Memory Prompt)** 動態注入規則。這允許：
- **同行/層級指派**: MainAgent 之間可以互相指派任務。
- **統一調用**: 任務管理器 (TaskManager) 以多態方式調用所有代理，不需區分角色類型。

## 4. 雙環執行模式 (Dual-Loop)

- **控制環 (Main Agent):** 
    - 通過工具調用 (`task_dispatcher`, `task_create`) 啟動任務。任務進行時，Main Agent 保持異步，不阻塞對話。
    - **權限控制**: 透過 `availableAgents` 白名單限制可調度的下屬代理。
- **執行環 (Autonomous Engine - JIT System):** 
    - 獨立運作於後台，由 `TaskManager` 驅動。
    - **JIT 展開**: 採按里程碑動態展開 (Just-In-Time) 模式，根據上一個里程碑的執行結果決定下一步。
    - **3x3 階梯式自癒 (Self-Healing)**: 
        1. **本地重試**: 單一任務失敗時由 `TaskManager` 自動重置狀態並重試 (上限 3 次)。
        2. **認知重規劃 (Cognitive Re-plan)**: 重試耗盡後，呼叫 `TaskPlanner` 進行任務圖的局部修改與依賴重組。
        3. **終極停機**: 重規劃 3 次仍失敗，標記為 `STUCK`。

## 5. 系統觀測層 (Observation Layer - Pulse Engine)
- **定位**: 系統的生命體徵監控器與自動化觸發器。
- **職責**:
    - **心跳監測 (Heartbeat)**: 監控任務執行狀態，超時自動拋出 `TASK_FAILED`，觸發自癒機制。
    - **狀態掛鉤 (Hooks)**: 監聽數據池 (State Pool) 變動，達到閾值時觸發預定義動作。
    - **系統脈搏 (System Tick)**: 提供統一的時間驅動源。

## 6. 執行安全與隔離 (Execution Sandbox)
- **路徑重定向**: 所有檔案工具自動將相對路徑映射至 `workspace/` 目錄。
- **逃逸偵測**: 嚴禁透過 `..` 跳轉訪問沙盒外的敏感檔案（如 `.env`）。
- **無狀態 Worker**: 所有的執行上下文、依賴結果與操作權限由「任務層」在派發時注入，確保 Worker 本身無狀態且可隨時拋棄重啟。