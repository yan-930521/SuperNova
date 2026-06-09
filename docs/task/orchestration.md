# 任務編排與調度協議 (Task Orchestration)

SuperNova 採用「模板驅動的狀態機 (Template-Driven State Machine)」模型進行任務編排，確保在不同場景下具備最優的執行路徑。

## 1. 核心編排模式：TaskFlow 狀態機
每個 `Task` 實體內部持有一個 **`TaskFlow`** 實例。在 0.4.0 架構中，這不再是簡單的數據結構，而是一套位於 `src/domain/task/flow/` 的 **獨立領域類別體系**。

### 1.1 任務類型類別 (Task Flow Classes)
每個任務模板對應一個具體的類別，負責封裝該模板特有的狀態遷徙邏輯：

- **`InstantFlow`**: 僅執行單次行動。
- **`SimpleFlow`**: `READY -> DOING -> FINISH`。
- **`StandardFlow`**: `READY -> PLANNING -> DOING -> CHECKING -> ACTING -> FINISH`。
- **`ComplexFlow`**: 強化版 Standard，帶有更深度的驗證路徑。
- **`ExploratoryFlow`**: 支援多路徑並行執行。
- **`EmergencyFlow`**: `READY -> DOING (reAct) -> CHECKING -> ACTING -> FINISH`。
- **`RecursiveFlow`**: 處理任務遞歸拆解。

### 1.2 遷徙行為
`TaskFlow` 類別定義了 `nextPhase(result)` 方法，根據執行結果決定狀態機的下一個節點，並在切換時觸發對應的系統事件。

### 1.2 TaskFlow 數據結構 (Domain Schema)
系統追蹤並維護任務模板類型、當前所處階段、完整的階段序列以及變遷軌跡。同時也包含用於異常處理的換檔標記，確保流程具備可回溯性。

### 1.3 任務的分形架構 (Fractal Architecture)
為了支援複雜任務的遞歸拆解（Recursive 模板），每個 `Task` 實體具備「分形」能力：
- **`Task.flow` (微觀流程)**：由狀態機驅動，決定當前任務處於 PDCA 的哪一個階段。
- **`Task.subGraph` (宏觀拆解)**：若該任務被進一步拆解為多個子任務，則持有 `TaskGraph` 實體來管理子任務間的依賴關係與就緒狀態。

這種設計允許系統將一個「大任務」視為一個「會話容器」，其內部的執行細節透過子圖與獨立的狀態機進行精確控制。

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