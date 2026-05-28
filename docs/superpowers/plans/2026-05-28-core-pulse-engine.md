# Core Pulse Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 'pulse' mechanism to drive periodic tasks and heartbeats in SuperNova.

**Architecture:** A `PulseEngine` class that uses `setInterval` to emit `SYSTEM_TICK` events and execute registered hooks based on tick intervals. It will be integrated into the `GlobalRuntime`.

**Tech Stack:** TypeScript, Jest, SuperNova EventBus.

---

### Task 1: Update System Events

**Files:**
- Modify: `src/infra/types/events.ts`

- [ ] **Step 1: Add SYSTEM_TICK and TASK_HEARTBEAT to SystemEventType**

```typescript
export enum SystemEventType {
  SESSION_CREATED = 'SESSION_CREATED',
  TASK_STARTED = 'TASK_STARTED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  PLAN_UPDATED = 'PLAN_UPDATED',
  SYSTEM_TICK = 'SYSTEM_TICK',
  TASK_HEARTBEAT = 'TASK_HEARTBEAT'
}
```

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: PASS

### Task 2: Define Pulse Hook Interface and Engine Skeleton

**Files:**
- Create: `src/infra/PulseEngine.ts`

- [ ] **Step 1: Create PulseEngine.ts with IPulseHook interface**

```typescript
import { IEventBus, SystemEventType } from './types/events';
import { recorder } from './LogManager';

/**
 * 脈搏掛鉤介面 (Pulse Hook Interface)
 */
export interface IPulseHook {
  id: string;
  interval: number; // 以秒(tick)為單位
  action: () => Promise<void> | void;
}

/**
 * 核心脈搏引擎 (Pulse Engine)
 * 負責驅動系統周期性任務與心跳。
 */
export class PulseEngine {
  private timer: NodeJS.Timeout | null = null;
  private tickCount: number = 0;
  private hooks: Map<string, IPulseHook> = new Map();

  constructor(private eventBus: IEventBus) {}

  /**
   * 啟動引擎
   * @param intervalMs 脈搏間隔（毫秒），預設 1000ms
   */
  start(intervalMs: number = 1000): void {
    if (this.timer) return;
    
    recorder.info('Pulse Engine starting...', { type: 'SYSTEM' });
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  /**
   * 停止引擎
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      recorder.info('Pulse Engine stopped.', { type: 'SYSTEM' });
    }
  }

  /**
   * 註冊掛鉤
   */
  registerHook(hook: IPulseHook): void {
    this.hooks.set(hook.id, hook);
    recorder.info(`Registered pulse hook: ${hook.id} (interval: ${hook.interval}s)`, { type: 'SYSTEM' });
  }

  /**
   * 移除掛鉤
   */
  unregisterHook(id: string): void {
    this.hooks.delete(id);
  }

  /**
   * 核心 Tick 邏輯
   */
  private tick(): void {
    this.tickCount++;
    
    // 發布系統 Tick 事件
    this.eventBus.publish({
      type: SystemEventType.SYSTEM_TICK,
      userId: 'SYSTEM',
      sessionId: 'SYSTEM',
      payload: { tickCount: this.tickCount },
      timestamp: Date.now()
    });

    // 執行過期的掛鉤
    for (const hook of this.hooks.values()) {
      if (this.tickCount % hook.interval === 0) {
        try {
          const result = hook.action();
          if (result instanceof Promise) {
            result.catch(error => {
              recorder.error(`Error in pulse hook ${hook.id}:`, { type: 'SYSTEM', payload: { error } });
            });
          }
        } catch (error) {
          recorder.error(`Error in pulse hook ${hook.id}:`, { type: 'SYSTEM', payload: { error } });
        }
      }
    }
  }
}
```

### Task 3: Pulse Engine Unit Tests

**Files:**
- Create: `tests/infra/PulseEngine.test.ts`

- [ ] **Step 1: Write failing tests for PulseEngine**

```typescript
import { PulseEngine, IPulseHook } from '../../src/infra/PulseEngine';
import { IEventBus, SystemEventType, ISystemEvent } from '../../src/infra/types/events';

describe('PulseEngine', () => {
  let eventBus: jest.Mocked<IEventBus>;
  let pulseEngine: PulseEngine;

  beforeEach(() => {
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn()
    } as any;
    pulseEngine = new PulseEngine(eventBus);
    jest.useFakeTimers();
  });

  afterEach(() => {
    pulseEngine.stop();
    jest.useRealTimers();
  });

  test('should publish SYSTEM_TICK event every tick', () => {
    pulseEngine.start(1000);
    
    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: SystemEventType.SYSTEM_TICK,
      payload: { tickCount: 1 }
    }));

    jest.advanceTimersByTime(1000);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: SystemEventType.SYSTEM_TICK,
      payload: { tickCount: 2 }
    }));
  });

  test('should execute registered hooks at correct intervals', () => {
    const action = jest.fn();
    const hook: IPulseHook = {
      id: 'test-hook',
      interval: 2,
      action
    };

    pulseEngine.registerHook(hook);
    pulseEngine.start(1000);

    // Tick 1
    jest.advanceTimersByTime(1000);
    expect(action).not.toHaveBeenCalled();

    // Tick 2
    jest.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(1);

    // Tick 3
    jest.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(1);

    // Tick 4
    jest.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests and verify they pass**

Run: `npx jest tests/infra/PulseEngine.test.ts`
Expected: PASS

### Task 4: Integrate PulseEngine into GlobalRuntime

**Files:**
- Modify: `src/runtime/GlobalRuntime.ts`

- [ ] **Step 1: Instantiate, start and stop PulseEngine in GlobalRuntime**

```typescript
// Add import
import { PulseEngine } from '../infra/PulseEngine';

// In class members
public pulseEngine: PulseEngine;

// In constructor
this.pulseEngine = new PulseEngine(this.eventBus);

// In start() method (near the end, after managers are initialized)
this.pulseEngine.start();

// In stop() method
this.pulseEngine.stop();
```

- [ ] **Step 2: Verify overall system initialization**

Run: `npm run lint`
Expected: PASS

### Task 5: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: PASS
