# 統一脈搏引擎 (Unified Pulse Engine) 實施計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個統一的脈搏引擎，整合原有的 HookRegistry 與 PulseEngine，支持 Agent 自主建立定時、數值閾值與事件驅動的掛鉤，並監控任務心跳。

**Architecture:** `PulseEngine` 作為全域單例，維護一個「全域狀態池 (Global State Pool)」與「Hook 註冊表」。它透過 `SYSTEM_TICK` 驅動輪詢檢查，並透過 `EventBus` 監聽與分發事件。

**Tech Stack:** TypeScript, Node.js (setInterval), EventBus

---

### Task 1: 基礎架構清理與型別定義

**Files:**
- Modify: `src/infra/types/events.ts`
- Modify: `src/infra/PulseEngine.ts` (型別重定義)

- [ ] **Step 1: 定義 Hook 相關型別**
在 `src/infra/PulseEngine.ts` 中新增以下介面：
```typescript
export enum PulseHookType {
  INTERVAL = 'INTERVAL',
  THRESHOLD = 'THRESHOLD',
  EVENT = 'EVENT'
}

export enum PulseActionType {
  EMIT_EVENT = 'EMIT_EVENT',
  START_TASK = 'START_TASK',
  LOG = 'LOG'
}

export interface IPulseHook {
  id: string;
  type: PulseHookType;
  config: {
    interval?: number; // For INTERVAL
    path?: string;     // For THRESHOLD (e.g., 'env.temp')
    operator?: '>' | '<' | '==' | '>='; // For THRESHOLD
    threshold?: any;   // For THRESHOLD
    eventName?: string; // For EVENT
    logic?: (payload: any) => boolean; // For EVENT/THRESHOLD custom logic
  };
  action: {
    type: PulseActionType;
    payload: any;
  };
}
```

- [ ] **Step 2: 提交變更**
```bash
git add src/infra/PulseEngine.ts
git commit -m "chore: define unified pulse hook types"
```

---

### Task 2: 全域狀態池 (Global State Pool) 實作

**Files:**
- Modify: `src/infra/PulseEngine.ts`

- [ ] **Step 1: 在 PulseEngine 中加入狀態池邏輯**
```typescript
export class PulseEngine {
  private statePool: Record<string, any> = {};

  public setState(path: string, value: any): void {
    const keys = path.split('.');
    let current = this.statePool;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  public getState(path: string): any {
    return path.split('.').reduce((obj, key) => obj?.[key], this.statePool);
  }
}
```

- [ ] **Step 2: 撰寫測試驗證狀態池讀寫**
在 `tests/infra/PulseEngine.test.ts` 中加入測試。

- [ ] **Step 3: 提交變更**
```bash
git add src/infra/PulseEngine.ts tests/infra/PulseEngine.test.ts
git commit -m "feat: implement global state pool in PulseEngine"
```

---

### Task 3: 重構 PulseEngine 以支持多型態 Hook

**Files:**
- Modify: `src/infra/PulseEngine.ts`

- [ ] **Step 1: 實作 Hook 檢查邏輯**
```typescript
  private checkHooks(): void {
    for (const hook of this.hooks.values()) {
      let triggered = false;
      
      if (hook.type === PulseHookType.INTERVAL) {
        triggered = this.tickCount % (hook.config.interval || 1) === 0;
      } else if (hook.type === PulseHookType.THRESHOLD) {
        const value = this.getState(hook.config.path || '');
        const threshold = hook.config.threshold;
        switch (hook.config.operator) {
          case '>': triggered = value > threshold; break;
          case '<': triggered = value < threshold; break;
          case '==': triggered = value == threshold; break;
        }
      }

      if (triggered) this.executeAction(hook.action);
    }
  }

  private executeAction(action: IPulseHook['action']): void {
    if (action.type === PulseActionType.EMIT_EVENT) {
      this.eventBus.publish(action.payload);
    }
    // ... 其他動作實作
  }
```

- [ ] **Step 2: 整合事件驅動 Hook**
訂閱 EventBus 的全域事件，當事件匹配時觸發 `EVENT` 類型的 Hook。

- [ ] **Step 3: 提交變更**
```bash
git add src/infra/PulseEngine.ts
git commit -m "feat: implement unified hook execution logic"
```

---

### Task 4: 整合任務心跳與超時監控

**Files:**
- Modify: `src/infra/PulseEngine.ts`
- Modify: `src/manager/TaskManager.ts`

- [ ] **Step 1: 在 PulseEngine 中加入任務監控清單**
```typescript
  private watchTasks: Map<string, { lastActive: number, timeout: number }> = new Map();

  public watchTask(taskId: string, timeout: number = 30000): void {
    this.watchTasks.set(taskId, { lastActive: Date.now(), timeout });
  }

  public updateHeartbeat(taskId: string): void {
    if (this.watchTasks.has(taskId)) {
      this.watchTasks.get(taskId)!.lastActive = Date.now();
    }
  }
```

- [ ] **Step 2: 在 TaskManager 中切換至新的監控機制**
移除 `TaskManager` 內部的 `checkTimeouts` 輪詢，改為向 `PulseEngine` 註冊任務。

- [ ] **Step 3: 提交變更**
```bash
git add src/infra/PulseEngine.ts src/manager/TaskManager.ts
git commit -m "refactor: unify task heartbeat monitoring into PulseEngine"
```

---

### Task 5: 驗證與 Plugin 測試

**Files:**
- Create: `tests/infra/PulseEnginePlugin.test.ts`

- [ ] **Step 1: 模擬 Plugin 註冊自定義事件與狀態觸發**
撰寫測試，模擬 Plugin 更新狀態池，並驗證 Agent 的 Hook 是否被觸發。

- [ ] **Step 2: 運行所有測試**
Run: `npm test`

- [ ] **Step 3: 提交變更**
```bash
git add tests/infra/PulseEnginePlugin.test.ts
git commit -m "test: verify plugin and custom event support in PulseEngine"
```
