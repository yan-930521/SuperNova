# 任務編排與分形執行流程 (Task Orchestration & Fractal Execution)

## 1. 核心設計理念
SuperNova 採用「任務即會話」與「分形架構」設計。一個複雜的母任務 (Parent Task) 可以透過規劃拆解成一個任務圖 (TaskGraph)，其內部的子任務 (Sub-tasks) 獨立執行，並在完成後回報給母任務，驅動母任務的狀態機前進。

## 2. 系統初始化：記憶體水合 (Hydration)
為了提高效能並確保狀態一致性，系統啟動時會執行以下操作：
*   **一次性載入**：`TaskScheduler` 啟動時從持久化層讀取母任務狀態不為封存的任務，並且讀取底下子任務。
*   **記憶體快取 (ActiveTasks)**：將這些任務存放於記憶體中的 `Map`。
*   **優勢**：後續的 `onTick` 輪詢直接操作記憶體對象，避免重複的磁碟 I/O 導致的依賴狀態（如 In-Degree）丟失。

## 3. 完整執行生命週期

### 階段一：任務啟動與路由
1.  **用戶輸入**：用戶發布目標。
2.  **Supervisor 決策**：`SupervisorAgent` 判定任務模板（如 `StandardFlow`）。
3.  **任務建立**：建立根任務 (Root Task)，進入 `PLANNING` 階段。

### 階段二：P 階段 - 分形拆解
1.  **規劃介入**：`PlanningAgent` 執行推理，產出 `TaskGraph` (子圖)。
2.  **子圖注入**：將 `TaskGraph` 寫入根任務的 `subGraph` 屬性。
3.  **狀態前進**：根任務進入 `DOING` 階段。

### 階段三：D 階段 - 分身調度 (The Tick Mechanism)
當母任務處於 `DOING` 且擁有 `subGraph` 時，`TaskScheduler` 的 `onTick` 邏輯會自動運作：
1.  **就緒檢查**：從 `subGraph` 中尋找入度為 0 (無未完成依賴) 且狀態為 `pending` 的子任務節點。
2.  **分發執行**：
    *   實例化子任務。
    *   **強制連結**：在子任務 `metadata` 中寫入 `parentTaskId` 指向母任務。
    *   將子任務加入記憶體快取並標記為 `running`。
    *   發布 `Phase.Start` 事件觸發具體執行。

### 階段四：結案與遞迴回報
1.  **子任務完成**：子任務走完其自身的 PDCA 流程（包含其下可能更深層的分形）。
2.  **母任務更新**：
    *   `TaskScheduler` 根據 `parentTaskId` 找到母任務。
    *   調用 `parentTask.subGraph.handleTaskCompletion(subTaskId)` 解鎖後續依賴。
3.  **自動推進**：下一個 Tick 會自動分發剛被解鎖的子任務。

### 階段五：母任務終結
1.  **全數完成**：當 `subGraph` 內所有節點均為 `completed`。
2.  **回標母任務**：發布母任務的 `Phase.Finish` 事件。並且封存任務
3.  **最終審核**：母任務進入 `CHECKING` 與 `ACTING`，最終產出回報給用戶。

## 4. 異常處理與自癒 (Self-Healing)
*   **Retry (重試)**：若子任務失敗，`CheckingAgent` 可發布 `Fail` 事件，讓 `TaskScheduler` 重啟該子任務。
*   **Escalation (上報)**：若子任務遇到無法解決的障礙，上報至 `SupervisorAgent` 進行高層次換檔 (Shift)。

---
*更新日期：2026-06-10*
*版本：0.5.0*
