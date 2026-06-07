# SuperNova PDCA 核心 Agent 實作計畫 (Phase 2 - Runtime Centric)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 Planning, Doing, Checking, Acting 四大 Agent 注入實質的 LLM 推理邏輯。

**Architecture:** 
- `BaseAgent` 僅注入 `id` 與 `bus` (Agent 專用 EventBus)。
- 所有其他服務（ModelRegistry, ContextService, MemoryService 等）均透過 `this.runtime` (GlobalRuntime) 存取。
- 遵循 `docs/memory/L1.md` 的 Key-Only 策略。

**Tech Stack:** TypeScript, LangChain, Zod.

---

### Task 1: 子類構造函數清理 (Subclass Constructor Cleanup)

**Files:**
- Modify: `src/agent/roles/SupervisorAgent.ts`
- Modify: `src/agent/roles/PlanningAgent.ts`
- Modify: `src/agent/roles/DoingAgent.ts`
- Modify: `src/agent/roles/CheckingAgent.ts`
- Modify: `src/agent/roles/ActingAgent.ts`

- [ ] **Step 1: 確保所有角色 Agent 構造函數僅注入 bus**

```typescript
// 範例
constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
  super(id, bus);
}
```

---

### Task 2: PlanningAgent 實作 (Goal -> TaskGraph)

**Files:**
- Modify: `src/agent/roles/PlanningAgent.ts`
- Create: `src/agent/roles/__tests__/PlanningAgent.test.ts`

- [ ] **Step 1: 實作 Planning 推理邏輯**

在 `onPlanStart` 中：
1. `const contextService = this.runtime.container.resolve<ContextService>('ContextService');`
2. `const engine = this.runtime.modelRegistry.getModel(ModelPreset.SMART);`
3. 渲染 Prompt：`contextService.renderPrompt('PlanningAgent', event.payload, [])` (初始黑板為空)。
4. 執行推理：`engine.infer(..., TodoListResponseSchema)`。
5. 發布 `Events.Task.Created` 包含任務圖。

---

### Task 3: DoingAgent 實作 (ReAct Loop)

**Files:**
- Modify: `src/agent/roles/DoingAgent.ts`

- [ ] **Step 1: 實作 ReAct 循環與工具調用**

1. 獲取 `ContextService` 與 `InferenceEngine`。
2. 實作 Thought -> Action -> Observation 循環。
3. 使用 `ReActResponseSchema`。
4. 整合 `this.runtime.toolRegistry` 執行工具。

---

### Task 4: Checking & Acting Agent 實作

**Files:**
- Modify: `src/agent/roles/CheckingAgent.ts`
- Modify: `src/agent/roles/ActingAgent.ts`

- [ ] **Step 1: 實作審核與改善邏輯**
  - 遵循相同的 `GlobalRuntime` 服務存取模式。

---

### Task 5: 提交與同步

- [ ] **Step 1: 提交變更**
Run: `git add . ; git commit -m "refactor: implement PDCA agent logic with runtime-centric service access"`
