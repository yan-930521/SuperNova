# 任務編排核心 (Task Orchestration Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 TaskService 與 TaskScheduler，驅動任務依照狀態機與依賴圖自動流轉，實現系統的自動化執行。

**Architecture:** 
1. **TaskService**: 負責 Task 實體的生命週期管理、持久化儲存與子圖 (subGraph) 聚合邏輯。
2. **TaskScheduler**: 監聽系統事件，驅動 TaskFlow 狀態機遷徙，並根據 TaskGraph 依賴關係自動分派任務給 Agent。
3. **Event-Driven**: 透過 EventBus 實現全非同步的協作鏈。

**Tech Stack:** TypeScript, EventEmitter

---

### Task 1: 實作 TaskService 應用層服務

**Files:**
- Create: `src/application/task/TaskService.ts`

- [ ] **Step 1: 定義 TaskService 基礎結構與 CRUD**
實作 `getTask`, `saveTask`, `findBySession` 等方法，對接到 `FileSystemTaskRepository`。

- [ ] **Step 2: 實作任務建立邏輯**
實作 `createTask` 方法，根據 `templateType` 初始化對應的 `TaskFlow` 實體。

- [ ] **Step 3: 實作分形子圖處理**
當子任務完成時，實作邏輯判定母任務是否也已完成或需進入下一階段。

### Task 2: 實作 TaskScheduler 核心調度器

**Files:**
- Create: `src/application/task/TaskScheduler.ts`

- [ ] **Step 1: 監聽 Flow 初始化事件**
監聽 `AgentEvents.Flow.Initialize`，呼叫 `TaskService` 建立任務，並啟動第一階段。

- [ ] **Step 2: 驅動狀態機遷徙邏輯**
監聽 `Planning.Finish`, `Doing.Finish`, `Checking.Pass/Fail`, `Acting.Finish` 事件。
調用 `task.nextPhase(result)` 並根據新階段發布對應的啟動事件（如 `Doing.Start`）。

- [ ] **Step 3: 基於 TaskGraph 的依賴派發**
實作 `tick` 邏輯（或監聽 `SystemEvents.Runtime.Tick`），檢查 `subGraph` 中哪些子任務已 Ready (入度為 0)，並發送啟動訊號。

### Task 3: 系統集成與生命週期掛接

**Files:**
- Modify: `src/runtime/GlobalRuntime.ts`

- [ ] **Step 1: 註冊 TaskService 與 TaskScheduler**
在 `GlobalRuntime` 的容器中註冊這兩個新服務。

- [ ] **Step 2: 初始化調度器監聽**
確保系統啟動時，`TaskScheduler` 正式開始監聽事件總線。

---

### Task 4: 驗證與提交

- [ ] **Step 1: 執行類型檢查**
Run: `bun x tsc --noEmit`

- [ ] **Step 2: 提交編排核心代碼**
```bash
git add . ; git commit -m "feat: implement TaskService and TaskScheduler for automated PDCA orchestration"
```
