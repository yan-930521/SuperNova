# 整合任務心跳與超時監控實施計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將任務心跳監控從 `TaskManager` 遷移至 `PulseEngine`，實現統一的系統監控機制。

**Architecture:** 在 `PulseEngine` 中新增任務追蹤 Map，在 `tick()` 中檢查超時。`TaskManager` 透過 `watchTask` 和 `unwatchTask` 與之互動。

**Tech Stack:** TypeScript, Jest, NodeJS

---

### Task 1: 增強 PulseEngine 監控功能

**Files:**
- Modify: `src/infra/PulseEngine.ts`
- Test: `tests/infra/PulseEngine.test.ts`

- [ ] **Step 1: 在 PulseEngine 中新增任務監控欄位與方法**
- [ ] **Step 2: 更新 tick() 以檢查任務超時**
- [ ] **Step 3: 撰寫測試驗證超時觸發**
- [ ] **Step 4: 運行測試並提交**

### Task 2: 重構 TaskManager 以使用 PulseEngine 監控

**Files:**
- Modify: `src/manager/TaskManager.ts`

- [ ] **Step 1: 更新 setupHeartbeatListener**
- [ ] **Step 2: 更新 executeNode 以監控任務**
- [ ] **Step 3: 移除 TaskManager 中的舊監控邏輯**
- [ ] **Step 4: 驗證整合並提交**
