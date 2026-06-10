# 代理邏輯簡化重造實作計畫 (終極修訂版)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重造 Agent 協作邏輯，由 SupervisorAgent 統一管理通用的 Phase 事件流，並修復專業 Agent 的啟動過濾與事件發布。

**Architecture:** 採用純事件驅動架構。SupervisorAgent 監聽 Dispatch 與 Finish 事件，透過 TaskService 驅動領域模型的 Phase 遷徙，並發布 Phase.Start 指令。

---

### Task 1: 實作 SupervisorAgent 的核心編排邏輯

**Files:**
- Modify: `src/agent/roles/SupervisorAgent.ts`

- [ ] **Step 1: 修改 onDispatch 啟動首個 Phase**

在路由決策後，建立任務，隨即發布首個 `Phase.Start` 事件（通常為 `PLANNING`）。

- [ ] **Step 2: 實作 onPhaseFinish 監聽器**

監聽 `AgentEvents.Phase.Finish`，呼叫 `taskService.transitionTask(taskId, 'success')` 獲取 `newPhase`。
如果 `newPhase` 不是 `FINISH`，則發布下一個階段的 `Phase.Start`。

- [ ] **Step 3: 實作 onPhaseFail 監聽器**

監聽 `AgentEvents.Phase.Fail`，目前的簡化邏輯可以先記錄日誌或簡單發布回退指令。

- [ ] **Step 4: 實作 Tick 併發調度邏輯**

將原先 `TaskScheduler` 中的 Tick 邏輯遷入 SA，負責掃描並啟動子任務。

- [ ] **Step 5: Commit**

```bash
git add src/agent/roles/SupervisorAgent.ts
git commit -m "feat: implement centralized orchestration in SupervisorAgent"
```

---

### Task 2: 修復專業 Agent (Planning, Doing, Checking, Acting)

**Files:**
- Modify: `src/agent/roles/PlanningAgent.ts`
- Modify: `src/agent/roles/DoingAgent.ts`
- Modify: `src/agent/roles/CheckingAgent.ts`
- Modify: `src/agent/roles/ActingAgent.ts`

- [ ] **Step 1: 統一訂閱 Phase.Start 並修正過濾邏輯**

移除錯誤的 `if(phase || phase != '...') return;`。
確保每個 Agent 只在 `payload.phase` 匹配時執行。

- [ ] **Step 2: 統一改用 Phase.Finish/Fail 發布結果**

將所有代碼中的 `AgentEvents.Planning.Finish` 等自定義枚舉改為通用的 `AgentEvents.Phase.Finish`。

- [ ] **Step 3: Commit**

```bash
git add src/agent/roles/PlanningAgent.ts src/agent/roles/DoingAgent.ts src/agent/roles/CheckingAgent.ts src/agent/roles/ActingAgent.ts
git commit -m "refactor: fix agents' phase filtering and event publishing"
```

---

### Task 3: 驗證

- [ ] **Step 1: 執行腳本驗證全流程**

Run: `bun scripts/task-demo.ts`
