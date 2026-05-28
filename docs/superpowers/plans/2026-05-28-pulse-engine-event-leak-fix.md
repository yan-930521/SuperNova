# PulseEngine 事件訂閱洩漏修復實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 PulseEngine 在處理 EVENT 類型掛鉤時產生的事件訂閱洩漏問題。

**Architecture:** 
- 擴充 `IEventBus` 介面以支援取消訂閱。
- 在 `PulseEngine` 中引入 `eventHandlers` Map 來追蹤與 hook ID 關聯的事件處理常式。
- 在註冊 Hook 時實施「先清理再註冊」策略，並在解除註冊時主動取消事件訂閱。

**Tech Stack:** TypeScript, Jest

---

### Task 1: 更新 IEventBus 介面

**Files:**
- Modify: `src/infra/types/events.ts`

- [ ] **Step 1: 在 IEventBus 中新增 unsubscribe 方法**

```typescript
export interface IEventBus {
  publish(event: ISystemEvent): void;
  subscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void;
  unsubscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void; // 新增此行
}
```

- [ ] **Step 2: 編譯檢查**
執行 `npx tsc --noEmit` 確保介面定義正確（預期會有實作該介面的類別報錯，這是正常的，下一步會處理）。

- [ ] **Step 3: Commit**

```bash
git add src/infra/types/events.ts
git commit -m "refactor: add unsubscribe to IEventBus interface"
```

---

### Task 2: 修復 PulseEngine 訂閱洩漏

**Files:**
- Modify: `src/infra/PulseEngine.ts`

- [ ] **Step 1: 新增 eventHandlers 屬性並更新 registerHook**

```typescript
// 在 PulseEngine 類別中新增屬性
private eventHandlers: Map<string, (event: any) => void> = new Map();

// 更新 registerHook
registerHook(hook: IPulseHook): void {
  // 1. 如果已存在相同 ID，先移除舊的以確保清理
  if (this.hooks.has(hook.id)) {
    this.unregisterHook(hook.id);
  }

  this.hooks.set(hook.id, hook);
  recorder.info(`Registered pulse hook: ${hook.id} (type: ${hook.type})`, { type: 'SYSTEM' });

  // 2. 如果是 EVENT 類型，需向 EventBus 訂閱
  if (hook.type === PulseHookType.EVENT && hook.config.eventName) {
    const handler = (event: any) => {
      this.handleEventHook(hook, event);
    };
    // 儲存 handler 以便後續取消訂閱
    this.eventHandlers.set(hook.id, handler);
    this.eventBus.subscribe(hook.config.eventName as SystemEventType, handler);
  }
}
```

- [ ] **Step 2: 更新 unregisterHook**

```typescript
unregisterHook(id: string): void {
  const hook = this.hooks.get(id);
  if (!hook) return;

  // 如果是 EVENT 類型且有儲存的 handler，則取消訂閱
  if (hook.type === PulseHookType.EVENT && hook.config.eventName) {
    const handler = this.eventHandlers.get(id);
    if (handler) {
      this.eventBus.unsubscribe(hook.config.eventName as SystemEventType, handler);
      this.eventHandlers.delete(id);
    }
  }

  this.hooks.delete(id);
  recorder.info(`Unregistered pulse hook: ${id}`, { type: 'SYSTEM' });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/infra/PulseEngine.ts
git commit -m "refactor: fix event subscription leak in PulseEngine"
```

---

### Task 3: 測試與驗證

**Files:**
- Modify: `tests/infra/PulseEngine.test.ts`

- [ ] **Step 1: 更新 Mock EventBus 並新增測試案例**

```typescript
// 在 tests/infra/PulseEngine.test.ts 的 beforeEach 中更新 mock
eventBus = {
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn() // 新增此行
} as any;

// 在 EVENT Hooks 描述區塊中新增測試
test('should unsubscribe when hook is unregistered', () => {
  const hook: IPulseHook = {
    id: 'leak-test-hook',
    type: PulseHookType.EVENT,
    config: { eventName: SystemEventType.TASK_STARTED as any },
    action: { type: PulseActionType.LOG, payload: 'test' }
  };

  pulseEngine.registerHook(hook);
  const handler = eventBus.subscribe.mock.calls[0][1];
  
  pulseEngine.unregisterHook('leak-test-hook');
  expect(eventBus.unsubscribe).toHaveBeenCalledWith(SystemEventType.TASK_STARTED, handler);
});

test('should unsubscribe old handler when re-registering same hook ID', () => {
  const hookId = 're-register-hook';
  const hook1: IPulseHook = {
    id: hookId,
    type: PulseHookType.EVENT,
    config: { eventName: SystemEventType.TASK_STARTED as any },
    action: { type: PulseActionType.LOG, payload: 'v1' }
  };

  pulseEngine.registerHook(hook1);
  const handler1 = eventBus.subscribe.mock.calls[0][1];

  const hook2: IPulseHook = {
    id: hookId,
    type: PulseHookType.EVENT,
    config: { eventName: SystemEventType.TASK_STARTED as any },
    action: { type: PulseActionType.LOG, payload: 'v2' }
  };

  pulseEngine.registerHook(hook2);
  // 應先呼叫 unsubscribe
  expect(eventBus.unsubscribe).toHaveBeenCalledWith(SystemEventType.TASK_STARTED, handler1);
  // 然後再次 subscribe
  expect(eventBus.subscribe).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: 執行測試**
執行 `npm test tests/infra/PulseEngine.test.ts`
預期：所有測試通過。

- [ ] **Step 3: Commit**

```bash
git add tests/infra/PulseEngine.test.ts
git commit -m "test: add tests for PulseEngine event subscription management"
```
