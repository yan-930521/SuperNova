# SuperNova 通訊與上下文標準化實作計畫 (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作標準化消息追蹤 (TraceID) 與基於 Key-Only 策略的上下文服務 (ContextService)，為 PDCA 蜂群協作奠定基礎。

**Architecture:** 
- 擴展 `IAgentEventPayload` 以包含 `traceId` 與 `spanId`。
- 建立 `ContextService` 負責渲染 `docs/context/prompt_template.md`，並實作黑板 (L1) 變數的 Key-Only 注入邏輯。
- 增強 `PulseEngine` 以監控具備 TraceID 的任務超時。

**Tech Stack:** TypeScript, Bun, LangChain (Prompt Templates), Zod.

---

### Task 1: 標準化消息追蹤 (IAgentMessage & TraceID)

**Files:**
- Modify: `src/core/messaging/IBus.ts`
- Modify: `src/agent/BaseAgent.ts`
- Modify: `src/agent/roles/SupervisorAgent.ts`

- [ ] **Step 1: 在 IAgentEventPayload 中加入追蹤欄位**

修改 `src/core/messaging/IBus.ts`：
```typescript
export interface IAgentEventPayload {
  readonly sessionId: string;
  readonly traceId: string;    // 新增：追蹤整個任務鏈
  readonly spanId?: string;    // 新增：識別當前執行片段
  readonly parentSpanId?: string; // 新增：用於父子關係
  readonly taskId?: string;
  readonly goal?: string;
  readonly content?: string;
  readonly error?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, any>;
}
```

- [ ] **Step 2: 更新 BaseAgent 以支援追蹤日誌**

修改 `src/agent/BaseAgent.ts` 中的 `log` 方法，使其自動包含 `traceId`：
```typescript
protected log(msg: string, level: 'info' | 'error' | 'debug' = 'info', context?: Partial<IAgentEventPayload>): void {
  const formattedMsg = `[Agent:${this.id}] ${msg}`;
  const logContext = {
    type: 'AGENT',
    agent_id: this.id,
    trace_id: context?.traceId,
    session_id: context?.sessionId,
    ...context?.metadata
  };
  
  if (level === 'error') {
    recorder.error(formattedMsg, logContext);
  } else if (level === 'debug') {
    recorder.debug(formattedMsg, logContext);
  } else {
    recorder.info(formattedMsg, logContext);
  }
}
```

- [ ] **Step 3: 更新 SupervisorAgent 的 Dispatch 邏輯**

修改 `src/agent/roles/SupervisorAgent.ts`，在 `onDispatch` 時產生或傳遞 `traceId`：
```typescript
private onDispatch(event: AgentEvent): void {
  const traceId = event.payload.traceId || crypto.randomUUID();
  this.log(`[Supervisor] dispatched goal: ${event.payload.goal}`, 'info', { 
    traceId, 
    sessionId: event.payload.sessionId 
  });
  // 後續發布 Planning.Start 時應攜帶此 traceId
}
```

- [ ] **Step 4: 驗證追蹤欄位是否存在**

編寫測試或運行 `chat-demo.ts` 觀察日誌中是否出現 `trace_id`。

---

### Task 2: 實作 ContextService (Key-Only 注入)

**Files:**
- Create: `src/application/context/ContextService.ts`
- Modify: `src/runtime/GlobalRuntime.ts`

- [ ] **Step 1: 建立 ContextService 骨架**

```typescript
import { PromptLoader } from '../../utils/PromptLoader';
import { IAgentEventPayload } from '../../core/messaging/IBus';

export class ContextService {
  private template: string;

  constructor() {
    this.template = PromptLoader.load('docs/context/prompt_template.md');
  }

  /**
   * 根據 Agent 角色與黑板狀態渲染 Prompt
   * 實作 Key-Only 策略：注入的內容僅包含變數的 Key
   */
  public renderPrompt(role: string, context: IAgentEventPayload, blackboardKeys: string[]): string {
    // 1. 處理 {{verified_facts}} (L2 索引在 L1 的呈現)
    const factKeys = blackboardKeys.filter(k => k.startsWith('fact_')).map(k => `- ${k}`).join('\n');
    
    // 2. 處理 {{available_tools}} 等變數替換
    let prompt = this.template
      .replace('{{AGENT_ROLE}}', role)
      .replace('{{verified_facts}}', factKeys || 'None');
    
    // ... 更多替換邏輯
    return prompt;
  }
}
```

- [ ] **Step 2: 在 GlobalRuntime 中註冊 ContextService**

修改 `src/runtime/GlobalRuntime.ts`：
```typescript
// import { ContextService } from '../application/context/ContextService';

// 在 start() 方法中
const contextService = new ContextService();
this.container.register('ContextService', contextService);
```

- [ ] **Step 3: 驗證 Prompt 渲染結果**

編寫單元測試驗證 `renderPrompt` 是否正確執行了 Key-Only 注入，即 `verified_facts` 區塊僅顯示 Key 而非具體數值。

---

### Task 3: 脈搏引擎任務監控 (Watchdog)

**Files:**
- Modify: `src/infra/PulseEngine.ts`

- [ ] **Step 1: 增強 PulseEngine 以支援 TraceID 監控**

修改 `src/infra/PulseEngine.ts` 的 `watchTask`：
```typescript
public watchTask(taskId: string, traceId: string, timeout: number = 30000): void {
  this.watchTasks.set(taskId, { lastActive: Date.now(), timeout, traceId });
  recorder.info(`[PulseEngine] Watching task ${taskId} (Trace: ${traceId}, Timeout: ${timeout}ms)`, { type: 'SYSTEM' });
}
```

- [ ] **Step 2: 測試超時報警**

手動模擬一個不回傳心跳的任務，觀察 `PulseEngine` 是否在 30 秒後正確發布 `Events.Task.Failed` 事件並包含 `traceId`。

---

### Task 4: 提交與同步

- [ ] **Step 1: 提交變更**
Run: `git add . ; git commit -m "feat: standardize agent communication and context service foundations"`

- [ ] **Step 2: 更新 ARCH.md 與 DEVELOPMENT_STEP.md**
將已完成的項目在進度表中勾選。
