# 任務編排與調度協議 (Task Orchestration)

SuperNova 採用「模板驅動的狀態機 (Template-Driven State Machine)」模型進行任務編排，確保在不同場景下具備最優的執行路徑。

## 1. 核心編排模式：動態狀態機
`SupervisorAgent` 內部維護一個狀態機，但其狀態遷徙的路徑並非硬編碼，而是由 **「目標模板 (Goal Template)」** 決定。

### 1.1 任務類型模板 (Task Templates)
- **Instant**: 僅 DA 立即執行（極短輸入，無上下文依賴）。
- **Simple**: 僅 DA 執行簡單查詢或操作。
- **Standard**: 完整 PDCA 循環 (`PA -> DA -> CA -> AA`)，適用於一般功能開發。
- **Complex**: 帶有完整驗證（Full Validation）的複雜任務的 PDCA 循環。
- **Exploratory**: `PA -> [DA1, DA2...] -> CA -> AA` 並行探索。多個 DA 並行嘗試，CA 僅負責品質檢核 (QA Only)。
- **Emergency**: `DA -> CA -> AA` 突發修復。跳過 PA，DA 使用 reAct (邊想邊做) 模式直接修復。
- **Recursive**: `PA -> DA(PDCA) -> CA -> AA` 任務層層遞歸拆解。

## 2. 目標模板 (Goal Template)
模板定義了任務的「骨架」，存放在 **L3 SOP** 中或由用戶啟動時指定。

### 2.1 模板包含內容:
- **執行路徑**: 定義狀態遷徙的順序。
- **角色權限**: 指定哪些 Agent 角色參與本任務。
- **門禁標準**: 定義進入下一個狀態的硬性條件（例如：必須通過 Unit Test 才能從 DOING 轉到 CHECKING）。
- **超時策略**: 每個狀態的生命預期 (TTL)。

## 3. 調度與生命週期
- **初始化**: `SupervisorAgent` 接收指令後，匹配對應模板，初始化狀態機。
- **事件驅動狀態遷徙**: 
    - 當 `Supervisor` 監聽到 `Planning.Finish` 時，根據模板指向下一個狀態（如 `Doing.Start`）。
    - 若收到 `Checking.Fail`，根據模板回跳至 `Doing` 或 `Planning`。
- **自癒掛接**: 當狀態執行發生失敗，優先觸發 [3x3 自癒機制](self_healing.md)。

## 4. 併發與分層
- **多任務併發**: 系統支持同時啟動多個獨立的 Session，每個 Session 擁有自己的狀態機實例與隔離的黑板。
- **子任務拆解**: `PlanningAgent` 產出的 `TaskGraph` 可以在一個 `DOING` 狀態內啟動更細粒度的並行子任務鏈。
