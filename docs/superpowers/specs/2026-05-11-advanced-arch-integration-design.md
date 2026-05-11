# DESIGN SPEC: Advanced Architecture Integration (SuperNova)

## 1. MIDDLEWARE PIPELINE (中間件流水線)

### Description
所有的核心行為（Tool 調用、Mutation 提交）必須經過一個標準化的中間件處理鏈。這允許系統在執行前後注入邏輯，而無需修改核心執行代碼。

### Architecture
- **MiddlewareChain**: 每個 Session 擁有一個可配置的管道。
- **Interceptors (攔截點)**:
    - `Pre-Execution`: 負責 Input 預檢、權限校驗及日誌記錄。
    - `Post-Execution`: 負責結果轉換、Output 分離及狀態追蹤。
    - `Error-Handling`: 負責異常捕獲、重試邏輯及 Fallback 策略。
- **Registration**: 由 Vertical System 或外掛套件註冊特定領域的處理邏輯。

---

## 2. MEMORY TIERING & COMPRESSION (記憶體分層與壓縮)

### Description
為了解決上下文窗口限制，系統將採用混合壓縮與分層存儲機制，確保 Agent 始終能訪問核心目標。

### Mechanisms
- **Active Context (主上下文)**: 僅保留當前任務的摘要指針 (Summary Pointers) 與核心 Goal。
- **Periodic Summary (週期性摘要)**: 當 Operation Log 超過閾值時，自動將歷史行為壓縮為結構化摘要。
- **Checkpoint Archive (關鍵節點歸檔)**: 在 TaskGraph 的關鍵任務節點完成後，強制進行狀態快照與存檔。
- **Tiered Retrieval**: 根據需求動態從 Archive 中拉取歷史細節。

---

## 3. DYNAMIC WORKER ROLES (動態 Worker 角色)

### Description
WorkerAgent 不再是固定職責的單元，而是具備動態切換能力的角色模型。

### Mechanisms
- **RoleSwitching**: Worker 可根據當前分配的 Task 上下文，動態掛載對應的 `Instruction Set`。
- **Specialist Modes**:
    - `CoderMode`: 掛載代碼編寫與測試規範。
    - `ResearcherMode`: 掛載資訊檢索與驗證策略。
    - `OrchestratorMode`: 掛載子任務拆解與資源調度指令。

---

## 4. STRICT ROLLBACK RECOVERY (嚴格回退恢復)

### Description
基於強一致性的快照機制，確保系統在發生不可修復錯誤時能夠安全恢復。

### Mechanisms
- **Task Snapshot**: 每個關鍵 Task 完成後，系統自動創建一個輕量級 Session 快照。
- **Automatic Rollback**: 當 `Execution Phase` 報出嚴重異常且 `Error-Handling Middleware` 無法修復時，Session 自動回退到最近一個成功的 Task Snapshot。
- **Recovery Path**: 回退後，系統可觸發 Planner 重新評估 TaskGraph，嘗試繞過錯誤路徑。

---

## 5. TOOL DIMENSIONS (工具多維度)

### Description
強化 Tool 的定義，從單純的函數執行轉向具備多維度屬性的「資源操作器」。

### Attributes
- **Input Validation (預檢)**: 每個 Tool 必須定義嚴格的 Schema 驗證與邏輯預檢。
- **Safety Tiering (風險評級)**:
    - `TIER_1 (Read-Only)`: 無副作用。
    - `TIER_2 (Side-Effect)`: 修改狀態但可逆。
    - `TIER_3 (Destructive)`: 高風險操作，需額外授權。
- **Data-Only Output (表現分離)**: Tool 只輸出純數據結構，由渲染層或 Middleware 決定最終呈現方式。
