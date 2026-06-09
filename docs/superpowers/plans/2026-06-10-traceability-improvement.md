# 改善系統可追蹤性實作計畫 (Traceability Improvement Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 貫通 `traceId` 與 `spanId` 的邏輯，實現「根任務錨定」與「DNA 嚴格繼承」。

**Architecture:** 
1. `traceId` 錨定於 `rootTaskId`。
2. `TaskScheduler` 作為中心中轉站傳遞 `parentSpanId`。
3. `BaseAgent` 封裝繼承邏輯，簡化子類實現並自動化日誌追蹤。

**Tech Stack:** TypeScript, Event-Driven Architecture.

---

### Task 1: 基礎設施強化 (Infrastructure)

**Files:**
- Modify: `src/utils/IdGenerator.ts`
- Modify: `src/core/messaging/IBus.ts`

- [ ] **Step 1: 更新 IdGenerator**
  
  修改 `src/utils/IdGenerator.ts`，增加語義化方法。
  
```typescript
// src/utils/IdGenerator.ts
// ...
  static trace(): string { return this.generate('trace_', true); } // 保留備用，但不建議手動呼叫
  
  /** 從根任務 ID 生成 Trace ID (錨定策略) */
  static traceFromTask(taskId: string): string {
    return taskId; // 直接使用 taskId 作為 traceId，實現貫通
  }
// ...
```

- [ ] **Step 2: 驗證 IBus 介面**
  
  確認 `src/core/messaging/IBus.ts` 中的 `IAgentEventPayload` 已包含必填的 `traceId` 與 `spanId`。

- [ ] **Step 3: Commit**
  
```bash
git add src/utils/IdGenerator.ts src/core/messaging/IBus.ts
git commit -m "infra: update IdGenerator and verify IBus for traceability"
```

---

### Task 2: BaseAgent 增強 (BaseAgent Enhancement)

**Files:**
- Modify: `src/agent/BaseAgent.ts`

- [ ] **Step 1: 更新日誌與輔助方法**
  
  修改 `BaseAgent.ts`，增加對 `context` 的自動處理。

```typescript
// src/agent/BaseAgent.ts
// 修改 log 方法，支援從事件中自動抓取上下文
protected log(msg: string, level: 'info' | 'error' | 'debug' | 'warn' = 'info', context?: Partial<IAgentEventPayload>): void {
    const formattedMsg = `[Agent:${this.id}] ${msg}`;
    // 如果 context 是從事件來的，自動提取 traceId 等
    const traceId = context?.traceId;
    const spanId = context?.spanId;
    
    const logContext = {
      type: 'AGENT',
      agent_id: this.id,
      trace_id: traceId,
      session_id: context?.sessionId,
      span_id: spanId,
      parent_span_id: context?.parentSpanId,
      ...context?.metadata
    };
    // ... 原有 log 邏輯
}

/** 輔助方法：根據當前事件，生成繼承的 Payload 基礎 */
protected inheritPayload(triggerEvent: IAgentEventPayload, rolePrefix: 'sa' | 'pa' | 'da' | 'ca' | 'aa' | 'sys'): Partial<IAgentEventPayload> {
    return {
        sessionId: triggerEvent.sessionId,
        traceId: triggerEvent.traceId,
        parentSpanId: triggerEvent.spanId, // 觸發者的 spanId 變成我的 parentSpanId
        spanId: IdGenerator.span(rolePrefix),
        taskId: triggerEvent.taskId
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/BaseAgent.ts
git commit -m "feat: enhance BaseAgent with inheritance helpers and context-aware logging"
```

---

### Task 3: TaskScheduler - DNA 中轉站 (The Bridge)

**Files:**
- Modify: `src/application/task/TaskScheduler.ts`

- [ ] **Step 1: 實作跨階段 Span 傳遞**
  
  在 `TaskScheduler` 監聽各階段完成事件並觸發下一階段時，確保 `parentSpanId` 被傳遞。

```typescript
// src/application/task/TaskScheduler.ts
// 在事件處理回呼中 (例如 Doing.Finish)
// 確保下一階段的事件 payload 帶有上一個事件的 spanId 作為 parentSpanId
```

- [ ] **Step 2: Commit**

```bash
git add src/application/task/TaskScheduler.ts
git commit -m "feat: implement span inheritance in TaskScheduler phase transitions"
```

---

### Task 4: 角色 Agent 重構 (Role Refactoring)

**Files:**
- Modify: `src/agent/roles/SupervisorAgent.ts`
- Modify: `src/agent/roles/PlanningAgent.ts`
- Modify: `src/agent/roles/DoingAgent.ts`
- Modify: `src/agent/roles/CheckingAgent.ts`
- Modify: `src/agent/roles/ActingAgent.ts`

- [ ] **Step 1: 重構 SupervisorAgent (入口)**
  
  確保在 `Dispatch` 階段建立 `traceId`。

- [ ] **Step 2: 重構其餘 Agent**
  
  全面改用 `this.inheritPayload()` 並移除手動生成 `traceId` 的代碼。

- [ ] **Step 3: Commit**

```bash
git add src/agent/roles/*.ts
git commit -m "refactor: implement strict traceability inheritance across all Agent roles"
```

---

### Task 5: 驗證 (Validation)

- [ ] **Step 1: 執行 Demo 腳本**
  
  運行 `bun run scripts/task-demo.ts`。

- [ ] **Step 2: 檢查日誌輸出**
  
  驗證日誌中是否存在連貫的 Trace 鏈路，且 `traceId` 等於初始 `taskId`。
