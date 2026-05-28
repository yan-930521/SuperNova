# Phase 3：任務動力層 (JIT & Pulse) 實施計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立系統的脈搏引擎 (Pulse Engine) 並將任務規劃重構為真正的 JIT (Just-in-Time) 模式。

**Architecture:** 
- **Pulse Engine**: 作為 `GlobalRuntime` 的一部分，提供核心滴答 (Tick) 機制，驅動週期性 Hook 與任務心跳檢測。
- **True JIT Planning**: 修改 `TaskPlanner` 與 `TaskManager` 的交互，從「一次性展開」改為「執行驅動展開」，即完成一個里程碑或任務後，根據結果動態展開下一步。

**Tech Stack:** TypeScript, Node.js (setInterval), LangGraph, EventBus.

---

### Task 1: 實作核心脈搏引擎 (Pulse Engine)

**Files:**
- Modify: `src/infra/types/events.ts` (新增事件型別)
- Create: `src/infra/PulseEngine.ts`
- Modify: `src/runtime/GlobalRuntime.ts` (注入與啟動)
- Test: `tests/infra/PulseEngine.test.ts`

- [ ] **Step 1: 新增脈搏相關事件型別**
```typescript
// src/infra/types/events.ts
export enum SystemEventType {
  // ... existing
  SYSTEM_TICK = 'SYSTEM_TICK',
  TASK_HEARTBEAT = 'TASK_HEARTBEAT'
}
```

- [ ] **Step 2: 撰寫 PulseEngine 測試**
  - 驗證滴答事件是否按時發布。
  - 驗證週期性 Hook 是否正確執行。

- [ ] **Step 3: 實作 PulseEngine**
  - 提供 `registerHook(id, interval, action)`。
  - 內部使用 `setInterval` 驅動 `tick()` 並發布 `SYSTEM_TICK`。

- [ ] **Step 4: 整合至 GlobalRuntime**
  - 在 `GlobalRuntime.start()` 時啟動脈搏。

---

### Task 2: 實作任務心跳與超時檢測

**Files:**
- Modify: `src/manager/TaskManager.ts`
- Modify: `src/agent/BaseAgent.ts`

- [ ] **Step 1: 讓 Agent 在執行過程中發送心跳**
  - 在 `BaseAgent.execute` 的關鍵點（如工具調用前後），透過 EventBus 發布 `TASK_HEARTBEAT` 事件。

- [ ] **Step 2: 在 TaskManager 中監聽心跳**
  - 為內存中的任務追蹤增加 `lastHeartbeat` 欄位。
  - 註冊一個 Pulse Hook，每隔固定週期檢查是否有運行中的任務超時（長時間無心跳）。

---

### Task 3: 重構為 True JIT 動態規劃

**Files:**
- Modify: `src/task/TaskPlanner.ts`
- Modify: `src/manager/TaskManager.ts`

- [ ] **Step 1: 修改 TaskPlanner.expandMilestone**
  - 重構 `expandMilestone`，使其支持僅展開單一指定的里程碑，而非循環所有里程碑。
  - 確保展開時能接收並利用之前的執行結果作為 Context。

- [ ] **Step 2: 在 TaskManager 中實現動態調度邏輯**
  - 移除 `processInbox` 中一次性展開所有任務的邏輯。
  - 實作「當里程碑 A 完成 -> 呼叫 Planner 展開里程碑 B」的觸發鏈。
  - 確保每次展開都帶入最新的 `Session` 歷史摘要，實現動態自癒。
