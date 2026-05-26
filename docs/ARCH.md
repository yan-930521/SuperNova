# SuperNova 2.0 架構設計 (Architecture Design)

## 1. 核心哲學 (Core Philosophy)
SuperNova 2.0 採用 **「狀態分離與職責解耦」**。系統明確區分 **對話上下文 (Conversation State)** 與 **執行上下文 (Execution State)**，實現 Main Agent 與 任務引擎的深度分離。

## 2. 雙層總帳架構 (Dual-Ledger Architecture)

### 2.1 會話層 (Session - Conversation Ledger)
- **定位:** 輕量級、面向對話的記錄器。
- **內容:** 儲存用戶原始目標、對話歷史及任務引擎回傳的高階狀態摘要。
- **指派機制:** 當一個 Session 被建立時，系統會從 `AgentRegistry` 中選取或建立一個 **MainAgent** 並與之綁定。該 MainAgent 成為該會話的首席負責人與用戶交互唯一窗口。
- **職責:** 負責維護與用戶的「溝通連貫性」。

### 2.2 任務層 (Task System - Execution Ledger)
- **定位:** 重量級、面向執行的詳細記錄器。
- **內容:** 
    - **詳細操作紀錄 (Detailed OpLog):** 每一格 Worker 的細節行動、工具輸入/輸出、原始報錯。
    - **任務圖 (TaskGraph):** 節點狀態與依賴關係。任務完成後保留在圖中，狀態標記為 `COMPLETED`。
- **職責:** 負責維護「執行的可靠性與可溯源性」。

## 3. 核心技術協議 (Technical Protocols)

### 3.1 統一執行上下文 (IAgentExecuteContext)
為了確保全鏈路追蹤，所有代理執行與工具調用必須攜帶此上下文：
- `sessionId`: 關聯的會話 ID。
- `traceId`: 全鏈路追蹤 ID。
- `agentId`: 發起操作的代理 ID。
- `taskId`: 當前任務節點 ID (選填)。

### 3.2 遞歸編排模型 (Recursive Orchestration)
所有代理類（MainAgent, WorkerAgent）均繼承自 `BaseAgent` 並共用 `execute` 接口。這允許：
- **同行/層級指派**: MainAgent 之間可以互相指派任務。例如：通用型 MainAgent 可以指派專業任務給 Coder型 MainAgent。
- **統一調用**: 任務管理器 (TaskManager) 以多態方式調用所有代理，不需區分角色類型。

## 4. 雙環執行模式 (Dual-Loop)

- **控制環 (Main Agent):** 
    - 通過工具調用啟動任務。任務進行時，Main Agent 保持異步，不阻塞對話。
    - **權限控制**: 透過 `availableAgents` 白名單限制可調度的下屬代理。
- **執行環 (Autonomous Engine):** 
    - 獨立運作於後台。
    - 發生執行錯誤時，首先在「任務層」嘗試自癒，必要時才向上拋出事件。

## 5. 執行安全與隔離 (Execution Sandbox)
- **路徑重定向**: 所有檔案工具自動將相對路徑映射至 `workspace/` 目錄。
- **逃逸偵測**: 嚴禁透過 `..` 跳轉訪問沙盒外的敏感檔案（如 `.env`）。
- **無狀態 Worker**: 所有的執行上下文、依賴結果與操作權限由「任務層」在派發時注入。
�過 `..` 跳轉訪問沙盒外的敏感檔案（如 `.env`）。
- **無狀態 Worker**: 所有的執行上下文、依賴結果與操作權限由「任務層」在派發時注入。
