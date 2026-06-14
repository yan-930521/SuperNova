# Task-Led 併發任務系統設計規範 (v0.7.0)

## 1. 核心理念 (Core Philosophy)
SuperNova 將從「代理中心」轉向「任務中心 (Task-led)」。任務不再只是被處理的對象，而是驅動系統運行的核心實體。

- **任務即主權 (Task Sovereignty)**：任務包含完成目標所需的完整上下文、驗證標準與依賴關係。
- **PDCA 併發解耦**：規劃、執行、驗證、反思四個階段均可獨立併發運行。
- **精確上下文注入 (Just-in-Time Context)**：僅在任務執行時，按需組裝最相關的資訊。

---

## 2. 任務實體架構 (Task Entity Schema)

每個任務實體必須包含以下核心欄位：

| 欄位 | 說明 |
| :--- | :--- |
| `id` | 唯一識別碼 |
| `goal` | 具體、可量化的目標描述 |
| `description` | 任務的執行細節與上下文 |
| `context` | 靜態背景資訊 (Markdown 格式) |
| `successCriteria` | 驗證是否成功的具體門禁 (DoD) |
| `dependencies[]` | 依賴的前置任務 ID 列表 |
| `output` | 執行後的原始產出內容 |
| `phaseSummary` | **(核心更新)** 該任務在完成 PDCA 後的精煉摘要 |
| `status` | `PENDING`, `READY`, `RUNNING`, `CHECKING`, `COMPLETED`, `FAILED` |

---

## 3. 併發與調度機制 (Concurrency & Scheduling)

### 3.1 階段併發控制 (Fine-grained Concurrency)
系統支援對 PDCA 各階段分別設定併發上限，以優化資源分配：
- `maxPlanning`: 限制同時進行的規劃任務 (預設 2)。
- `maxDoing`: 大規模並行執行任務 (預設 10)。
- `maxChecking`: 併發啟動驗證邏輯 (預設 5)。
- `maxActing`: 限制反思與沉澱任務 (預設 2)。

### 3.2 Pulse Engine 驅動邏輯
`PulseEngine` 作為系統脈搏，每秒執行以下「調度泵」邏輯：
1. **掃描 (Scan)**：找出所有 `status: PENDING` 且所有依賴項已 `COMPLETED` 的任務。
2. **入隊 (Queue)**：將符合條件的任務狀態改為 `READY` 並加入待執行隊列。
3. **分配 (Dispatch)**：根據當前各階段的 `RUNNING` 總數與配置上限，彈出任務並發布 `Task.Start` 事件。

---

## 4. Task Graph 與死循環檢查 (Graph & Cycle Detection)

### 4.1 拓撲結構 (DAG)
系統使用 Directed Acyclic Graph 管理任務間的偏序關係。
- **Kahn's Algorithm**：在每次建立依賴關係時進行全量掃描。
- **異常處理**：若檢測到循環依賴（如 A -> B -> A），立即拋出錯誤並中斷該任務鏈，觸發系統級自癒告警。

---

## 5. 即時上下文組裝策略 (Context Assembly)

為了最小化 Token 消耗並提升精度，組裝邏輯遵循「局部與摘要優先」原則：

1. **依賴摘要注入**：不加載前置任務的完整歷史，僅讀取其 `phaseSummary`。
2. **對話歷史過濾**：僅從 L1 黑板中提取與當前 `traceId` 嚴格相關的關鍵對話片段。
3. **必要資訊掛接**：將任務內部的 `context` 與 `goal` 作為核心指令集。

**組裝後的 Prompt 結構範例：**
> ## 任務背景
> [Static Context]
>
> ## 前置任務摘要
> - 任務 A 完成摘要: [Summary A]
> - 任務 B 完成摘要: [Summary B]
>
> ## 當前目標
> [Goal]
>
> ## 驗證標準 (DoD)
> [Success Criteria]

---

## 6. 相應工具鏈更新

- `add_task_dependency(childId, parentId)`：新增依賴並觸發死循環檢查。
- `summarize_phase_output(taskId)`：在 Checking PASS 後，由系統或 ActingAgent 呼叫，產出精煉摘要。
- `assemble_task_context(taskId)`：執行前調用的內部組裝函數。
