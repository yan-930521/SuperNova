# SuperNova 核心實作計劃 (Phase 4: Planning & Scheduling)

> **對於 Agentic Workers：** 建議使用 `superpowers:subagent-driven-development` 技能來逐項執行此計劃。

**目標：** 實作任務圖 (DAG) 管理與並行調度引擎，實現高效的任務依賴處理與並發執行。

**架構：** 遵循 Tier 2 設計，實作基於入度 (In-degree) 的並行調度算法，優化任務執行流水線。

**技術棧：** TypeScript。

---

### 任務 1：實作任務圖數據結構 (TaskGraph)

**文件：**
- 創建：`src/session/TaskGraph.ts`
- 測試：`tests/session/TaskGraph.test.ts`

- [ ] **步驟 1：撰寫測試案例**
測試節點添加、依賴關係建立、循環依賴檢測以及入度計算。

- [ ] **步驟 2：實作 TaskGraph 類**
維護節點與邊的關係，提供獲取所有入度為 0 的節點的方法。

- [ ] **步驟 3：提交變更**
```bash
git add src/session/TaskGraph.ts tests/session/TaskGraph.test.ts
git commit -m "feat: implement TaskGraph with dependency tracking and cycle detection"
```

---

### 任務 2：實作並行調度引擎 (ParallelScheduler)

**文件：**
- 創建：`src/session/ParallelScheduler.ts`
- 測試：`tests/session/ParallelScheduler.test.ts`

- [ ] **步驟 1：撰寫調度流程測試**
驗證當依賴任務完成後，子任務是否能正確進入就緒隊列。

- [ ] **步驟 2：實作 ParallelScheduler 類**
負責與 `TaskGraph` 和 `IReadyQueue` 互動，驅動任務的流轉。

- [ ] **步驟 3：提交變更**
```bash
git add src/session/ParallelScheduler.ts tests/session/ParallelScheduler.test.ts
git commit -m "feat: implement ParallelScheduler for concurrent task dispatching"
```

---

### 任務 3：整合 ReadyQueue 到 BaseSession

**文件：**
- 修改：`src/session/BaseSession.ts`
- 測試：`tests/session/BaseSession_Scheduling.test.ts`

- [ ] **步驟 1：撰寫整合測試**
模擬多個並行任務的執行流。

- [ ] **步驟 2：更新 BaseSession**
實作 `ReadyQueue` 接口或集成 `IReadyQueue` 實作，並在 `tick()` 中調用調度器。

- [ ] **步驟 3：提交變更**
```bash
git add src/session/BaseSession.ts tests/session/BaseSession_Scheduling.test.ts
git commit -m "feat: integrate parallel scheduling into BaseSession lifecycle"
```
