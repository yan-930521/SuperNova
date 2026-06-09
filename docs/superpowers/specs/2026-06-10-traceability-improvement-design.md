# 改善系統可追蹤性設計文件 (Traceability Improvement Design)

## 1. 核心目標
建立嚴密的追蹤鏈路邏輯，確保 `traceId` 貫通整個任務生命週期，並透過 `spanId` 與 `parentSpanId` 構建清晰的任務執行樹狀圖。

## 2. ID 定義與關聯邏輯 (Anchoring Strategy)
- **根任務錨定 (Root-Task Anchoring)**：
    - `traceId` 不再隨機生成。
    - 當 `SupervisorAgent` 接收到初始目標並建立 Root Task 時，該 Root Task 的 `taskId` 即為此鏈路的 `traceId`。
- **DNA 繼承 (Inheritance)**：
    - 所有衍生的事件 (Event)、子任務 (Sub-task) 必須無條件繼承起始點的 `traceId`。
- **Span 鏈接 (Span Linking)**：
    - `spanId`：標識當前執行單元（Agent 或 System）。
    - `parentSpanId`：標識「是誰觸發了我」。
    - 鏈路公式：`Current.parentSpanId = Previous.spanId`。

## 3. 關鍵組件調整

### 3.1 IdGenerator
- 優化 `span()` 方法，確保角色前綴（sa, pa, da, ca, aa, sys）清晰。
- 顯式化 `traceId` 生成邏輯，與根任務 ID 掛鉤。

### 3.2 通訊協議 (IBus.ts)
- `IAgentEventPayload` 強制化：
    - `traceId`: `string` (Required)
    - `spanId`: `string` (Required)
    - `parentSpanId`: `string | undefined` (Required)

### 3.3 代理基類 (BaseAgent.ts)
- **自動日誌上下文**：`this.log` 應自動從當前處理的事件中抓取 `traceId` 與 `spanId`。
- **繼承輔助**：提供內部方法確保發出事件時自動填入正確的 `traceId` 與 `parentSpanId`。

### 3.4 任務調度器 (TaskScheduler.ts)
- 作為「繼承中轉站」，在派發任務（emit `Start` 事件）時，負責提取前一個階段事件的 `spanId` 並將其設為下一階段的 `parentSpanId`。

## 4. 鏈路生命週期範例
1. **入口 (SA)**: 
   - Task: `task_abc`
   - Event: `traceId: task_abc`, `spanId: span_sa_1`, `parentSpanId: undefined`
2. **規劃 (PA)**:
   - Input Event: 承接上述。
   - Internal Span: `span_pa_2`
   - Output Event: `traceId: task_abc`, `spanId: span_pa_2`, `parentSpanId: span_sa_1`
3. **執行 (DA)**:
   - Input Event: 承接 PA 的 Output。
   - Internal Span: `span_da_3`
   - Output Event: `traceId: task_abc`, `spanId: span_da_3`, `parentSpanId: span_pa_2`

## 5. 驗證標準
- 所有日誌輸出行必須包含正確的 `[Trace: ...]` 與 `[Span: ...]`。
- 透過 `traceId` 檢索，可完整還原從 SA -> TS -> PA -> TS -> DA -> TS -> CA -> TS -> AA 的完整路徑。
- 鏈路中不應出現任何 `traceId` 突變或隨機生成的情況。
