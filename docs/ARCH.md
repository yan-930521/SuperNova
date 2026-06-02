# SuperNova 0.3.0 架構設計 (Architecture Design)

## 1. 核心哲學 (Core Philosophy)
SuperNova 0.3.0 延續並深化了 **「狀態分離與職責解耦」** 的原則。系統採用 **分層領域架構 (Layered Domain Architecture)**，將技術實現（基礎設施）與業務編排（應用層）及核心邏輯（領域層）徹底隔離。

## 2. 四層架構模型 (Four-Layer Model)

### 2.1 介面層 (Interface Layer)
- **職責**: 處理外部輸入（如 CLI、API），將其轉化為系統內部的 `Command`。
- **組件**: Demo 腳本、控制台進入點。

### 2.2 應用層 (Application Services)
- **職責**: 負責 **跨模組編排 (Orchestration)**，是系統的業務大腦。
- **SessionService (客戶經理)**: 管理人機對話生命週期，維護溝通總帳。
- **TaskService (專案主管)**: 管理任務生命週期，處理 3x3 自癒決策與狀態變遷。
- **TaskScheduler (排程器)**: **(新)** 獨立的執行節拍器，負責根據 `TaskGraph` 狀態與資源分配執行任務。

### 2.3 領域層 (Domain Layer)
- **職責**: 純粹的業務邏輯與狀態變遷，無外部依賴。
- **BaseSession 體系**: 引入「全域會話協議」，確立 **「任務即會話 (Task is a Session)」** 的繼承結構。
- **TaskGraph**: 純粹的 DAG 演算與依賴檢核邏輯。

### 2.4 基礎設施層 (Infrastructure Adapters)
- **職責**: 技術支撐，通過 `IRepository` 與 `Provider` 介面對外提供服務。
- **Persistence**: 統一的 `BaseFileSystemRepository` 支援 JSON 與增量 JSONL 存儲。
- **Messaging**: 強型別的 `CommandBus` (同步) 與 `EventBus` (非同步) 通訊基座。
- **Observability**: `PulseEngine` 負責心跳偵測與超時自癒。

## 3. 雙層總帳與統一會話 (Unified Session Protocol)

系統將所有的訊息流動視為不同層級的「會話鏈」：

### 3.1 一級總帳 (Communication Ledger)
- **實體**: `UserSession` (繼承自 `BaseSession`)。
- **內容**: 用戶與 AI 的對話、任務執行的高階摘要。
- **管理**: 由 `SessionService` 維護連貫性。

### 3.2 二級總帳 (Execution Ledger)
- **實體**: `Task` (繼承自 `BaseSession`)。
- **內容**: Agent 執行的完整思考軌跡 (Thought -> Action -> Observation)。每個任務都是一個具備目標的獨立會話。
- **管理**: 由 `TaskService` 監控執行狀態。

## 4. 通訊協議：Command-Event 混合模式

為了確保結構明確與通訊統一，系統嚴格遵循以下模式：

- **Commands (指令)**: 
    - **方向**: 點對點 (一對一)。
    - **特性**: 同步呼叫、期待回傳結果、用於請求「主動動作」。
    - **範例**: `Events.Session.Start`。
- **Events (事件)**: 
    - **方向**: 廣播 (一對多)。
    - **特性**: 非同步發布、不等待回傳、用於通知「狀態變遷」。
    - **範例**: `Events.Task.Finished`。

## 5. 系統自癒與觀測 (Self-Healing & Observability)

### 5.1 3x3 自癒階梯
1. **Node Retry**: 單體任務失敗自動原地重試。
2. **Cognitive Re-plan**: 偵測到邏輯錯誤或重試耗盡，觸發 `PlanningCoordinator` 修正任務圖。
3. **STUCK 標記**: 終極失敗，等待人類介入 (HITL)。

### 5.2 脈搏監控 (Pulse Engine)
- **Heartbeat**: 實作 `ILifecycle`，在背景定時掃描超時任務。
- **Hooks**: 支援 `INTERVAL`、`THRESHOLD` 與 `EVENT` 三種自動化觸發機制。

## 6. 執行安全與隔離 (Execution Sandbox)
- **路徑重定向**: Infrastructure 層統一處理路徑映射，確保領域層與 Worker 僅能操作 `workspace/` 內的受控資源。
- **無狀態執行**: Worker 由應用層在派發時注入上下文與依賴結果，確保可隨時拋棄與重啟。
