# SuperNova 架構優化設計規範 (Industrial Refinement Spec)

*   **日期：** 2026-05-11
*   **狀態：** 評審中 (Reviewing)
*   **目標：** 提升 SuperNova 架構的穩定性、可觀測性、數據一致性與執行效率，使其達到工業級標準。

---

## 1. 背景與動機 (Context & Motivation)
目前的 `ARCH.md` 定義了一個優秀的數據驅動 Agent 框架底座，但在面對複雜、高負載及不穩定（如出錯的 Tool）的生產環境時，缺乏必要的保護機制與追蹤手段。本設計旨在補齊這些缺口，確保系統的健壯性與可維護性。

---

## 2. 核心改進模組 (Core Refinement Modules)

### 2.1 穩定性：ToolRuntime 守護者模式 (Stability)
**設計意圖：** 防止不穩定的 Tool 調用（如死循環、超時、未捕獲異常）拖垮整個 Session 甚至系統 Runtime。

*   **執行包裝 (Execution Wrapper)：** 所有的 `Tool.run()` 調用必須通過 `Guardian` 接口。
*   **超時機制 (TTL)：** 每個 Tool 調用需設置 `timeout`（預設 30s）。超時後強制中斷執行並回傳 `TimeoutError`。
*   **異常隔離：** 捕獲所有 Tool 層級的異常，將其轉化為標準化的 `ExecutionResult.Error`，避免異常向上拋出至全局 Tick。
*   **重試策略：** 支持聲明式的重試機制 (`max_retries`, `backoff`)。

### 2.2 觀測性：Session Scoped OpLog (Observability)
**設計意圖：** 以 Session 為邊界，建立完整的因果鏈追蹤，實現「操作可審計、錯誤可回溯」。

*   **OpLog 結構：** 在 `Session` 中維護一個順序存儲的日誌隊列。
*   **關鍵追蹤點 (Key Spans)：**
    *   `TASK_DISPATCH`: 任務分配給 Agent 的時間與參數。
    *   `INTENT_LOG`: Agent 生成的執行意圖（推理路徑）。
    *   `TOOL_INVOKE`: 工具呼叫的具體輸入。
    *   `EXEC_RESULT`: 工具執行的原始輸出與耗時。
*   **TraceID 傳播：** 在 `Event` 與 `Message` 中嵌入傳遞 `session_id`，確保所有產生的連鎖反應都能關聯回原始 Session。

### 2.3 一致性：階層式衝突裁決 (Consistency)
**設計意圖：** 解決多 Agent 同時修改系統規則 (Hook/Policy) 時的競爭問題。

*   **修改提案制 (Mutation Proposal)：** Agent 不直接修改 HookRegistry，而是提交 `MutationRequest`。
*   **裁決鏈 (Arbitration Chain)：**
    1.  **MutationValidator**: 進行靜態規則校驗（Schema & Policy）。
    2.  **CoordinatorAgent**: 進行動態衝突審核。檢查多個 Request 是否作用於同一個 Hook 且邏輯衝突。
    3.  **RootAgent (Escalation)**: 若 Coordinator 無法決策，則升級至 Root 進行全域裁決。
*   **原子化套用：** 通過裁決後，修改在下一個 Session Tick 的 `Mutation Phase` 統一生效。

### 2.4 性能：並行 DAG 調度器 (Concurrency)
**設計意圖：** 榨乾多核 CPU 性能，優化複雜任務圖的執行速度。

*   **動態依賴分析：** 實時維護 `TaskGraph` 的入度 (In-degree) 狀態。
*   **Ready Queue：** 將所有入度為 0 且未執行的 Task 放入就緒隊列。
*   **並發執行：** `SessionRuntime` 同時從隊列中取出多個 Task，分配給多個空閒的 **WorkerAgent** 異步執行。
*   **Tick 同步點：** 每個階段的結果匯總需在 Tick 結束前完成同步，確保數據一致性。

---

## 3. 數據結構變動 (Data Model Changes)

### 3.1 Session 擴展
```json
{
  "op_log": [],
  "ready_queue": [],
  "mutation_buffer": [],
  "config": {
    "tool_timeout": 30000,
    "max_parallel_tasks": 4
  }
}
```

### 3.2 MutationRequest
```json
{
  "requester_id": "agent_001",
  "target_hook": "combat_logic",
  "proposed_change": "data_payload",
  "priority": "normal",
  "version_ref": "v1.2.0"
}
```

---

## 4. 成功準則 (Success Criteria)
1.  單個 Tool 死循環不會導致進程崩潰或 Tick 永久卡死。
2.  開發者可以通過 Session ID 獲取該任務的完整執行時序圖。
3.  多 Agent 修改衝突時，系統能給出明確的「拒絕」或「合併」決策，而非隨機崩潰。
4.  在有並行路徑的 TaskGraph 中，執行速度提升應與可用 Worker 數量成正相關。
