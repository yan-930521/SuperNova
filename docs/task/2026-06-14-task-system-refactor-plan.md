# Task-Led 併發任務系統實施計畫

> **對於代理執行者：** 必須使用 `superpowers:subagent-driven-development`（推薦）或 `superpowers:executing-plans` 按任務執行此計畫。步驟使用複選框 (`- [ ]`) 語法進行追蹤。

**目標：** 重構任務系統，實現以任務為中心、具備死循環檢查與 PDCA 分階段併發控制的高效引擎。

**架構：** 採用拓撲驅動 (Topology-driven) 的反應式調度架構，結合即時上下文組裝與階段性產出摘要。

**技術棧：** TypeScript, Directed Acyclic Graph (Kahn's Algorithm), Event-driven Architecture.

---

### 任務 1：任務實體 (Task Entity) 強化與 DTO 更新

**文件：**
- 修改：`src/infra/types/task.ts` (更新 DTO)
- 修改：`src/domain/task/Task.ts` (更新實體類)

- [x] **步驟 1：更新 TaskDTO 結構**
    在 `TaskDTO` 中新增 `successCriteria`, `phaseSummary`, `context` 等欄位。

- [x] **步驟 2：更新 Task 實體類屬性與構造函數**
    實作屬性映射，確保 `fromDTO` 與 `toDTO` 正確處理新欄位。

- [x] **步驟 3：編寫驗證腳本並執行**
    確保實體能正確序列化與反序列化，且不丟失新欄位。

---

### 任務 2：TaskGraph 死循環檢查與拓撲導航

**文件：**
- 修改：`src/domain/task/TaskGraph.ts`

- [ ] **步驟 1：實作 Kahn's Algorithm 偵測死循環**
    新增 `detectCycle()` 方法，在 `addDependency` 時觸發。

- [ ] **步驟 2：編寫死循環測試案例並執行**
    手動建立 A -> B -> A 的依賴關係，確保系統拋出 `CircularDependencyError`。

- [ ] **步驟 3：最佳化 `getReadyTasks()`**
    使其能根據 PDCA 階段過濾就緒任務。

---

### 任務 3：PulseEngine 分階段併發調度器

**文件：**
- 修改：`src/infra/PulseEngine.ts`
- 修改：`src/application/task/TaskService.ts`

- [ ] **步驟 1：在配置中定義分階段併發上限**
- [ ] **步驟 2：重構 PulseEngine 的 Tick 邏輯**
    使其每秒呼叫 `TaskService.dispatchReadyTasks()`。
- [ ] **步驟 3：實作併發計數門禁**
    在啟動任務前檢查該階段的 `runningCount` 是否超出上限。

---

### 任務 4：即時上下文組裝與摘要機制

**文件：**
- 建立：`src/application/context/ContextAssembler.ts`
- 修改：`src/domain/task/Task.ts`

- [ ] **步驟 1：實作 `ContextAssembler`**
    根據任務依賴項，抓取 `phaseSummary` 並拼裝 Markdown。
- [ ] **步驟 2：實作摘要生成邏輯**
    在任務完成時，觸發一個輕量級摘要任務。
- [ ] **步驟 3：整合至任務啟動流程**
    確保 Agent 領取任務時收到的是組裝後的 Context。

---
