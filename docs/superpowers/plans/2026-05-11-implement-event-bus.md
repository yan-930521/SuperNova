# EventBus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a centralized EventBus for decoupled component communication within the SuperNova runtime.

**Architecture:** A standard Observer pattern implementation using `Map<string, Set<Function>>` for efficient handler management. Synchronous distribution of events with English logging.

**Tech Stack:** TypeScript, Jest

---

### Task 1: Define IEventBus Interface

**Files:**
- Create: `interfaces/infra/IEventBus.ts`

- [ ] **Step 1: Create the IEventBus interface file**

```typescript
import { IEvent } from '../models/IEvent';

/**
 * 事件總線接口
 * 負責系統內部的事件發布與訂閱。
 */
export interface IEventBus {
  /**
   * 發布事件
   * 將事件分發給所有對該類型感興趣的訂閱者。
   * @param event 符合 IEvent 結構的事件對象
   */
  publish(event: IEvent): void;

  /**
   * 訂閱事件
   * 註冊一個處理函數，當指定類期的事件發生時被調用。
   * @param type 事件類型字串 (精確匹配)
   * @param handler 處理函數 (接收 IEvent 作為參數)
   */
  subscribe(type: string, handler: (event: IEvent) => void): void;

  /**
   * 取消訂閱
   * 移除已註冊的處理函數。
   * @param type 事件類型字串
   * @param handler 原註冊的處理函數引用
   */
  unsubscribe(type: string, handler: (event: IEvent) => void): void;
}
```

- [ ] **Step 2: Verify the file exists and is correctly typed**

Run: `npx tsc interfaces/infra/IEventBus.ts --noEmit`
Expected: Success

---

### Task 2: Implement EventBus with TDD

**Files:**
- Create: `src/infra/EventBus.ts`
- Test: `tests/infra/EventBus.test.ts`

- [ ] **Step 1: Write a failing test for basic publish/subscribe**

Create `tests/infra/EventBus.test.ts`:
```typescript
import { EventBus } from '../../src/infra/EventBus';
import { IEvent } from '../../interfaces/models/IEvent';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should notify subscriber when event is published', () => {
    const handler = jest.fn();
    const event: IEvent = {
      type: 'test-event',
      payload: { data: 'hello' },
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    };

    eventBus.subscribe('test-event', handler);
    eventBus.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/infra/EventBus.test.ts`
Expected: FAIL (EventBus not defined)

- [ ] **Step 3: Implement minimal EventBus to pass the test**

Create `src/infra/EventBus.ts`:
```typescript
import { IEventBus } from '../../interfaces/infra/IEventBus';
import { IEvent } from '../../interfaces/models/IEvent';

/**
 * 事件總線實作
 * 使用 Map 與 Set 進行高效的事件分發。
 */
export class EventBus implements IEventBus {
  private handlers: Map<string, Set<(event: IEvent) => void>> = new Map();

  /**
   * 發布事件
   */
  publish(event: IEvent): void {
    console.log(`[EventBus] Publishing event: ${event.type}`);
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[EventBus] Error in handler for ${event.type}:`, error);
        }
      });
    }
  }

  /**
   * 訂閱事件
   */
  subscribe(type: string, handler: (event: IEvent) => void): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  /**
   * 取消訂閱
   */
  unsubscribe(type: string, handler: (event: IEvent) => void): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
      if (typeHandlers.size === 0) {
        this.handlers.delete(type);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/infra/EventBus.test.ts`
Expected: PASS

---

### Task 3: Complete Test Coverage

**Files:**
- Modify: `tests/infra/EventBus.test.ts`

- [ ] **Step 1: Add more test cases for type isolation and multiple subscribers**

Update `tests/infra/EventBus.test.ts`:
```typescript
  it('should not notify subscriber of different event type', () => {
    const handler = jest.fn();
    const event: IEvent = {
      type: 'other-event',
      payload: {},
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    };

    eventBus.subscribe('test-event', handler);
    eventBus.publish(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should notify multiple subscribers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const event: IEvent = {
      type: 'test-event',
      payload: {},
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    };

    eventBus.subscribe('test-event', handler1);
    eventBus.subscribe('test-event', handler2);
    eventBus.publish(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
  });

  it('should not notify after unsubscribe', () => {
    const handler = jest.fn();
    const event: IEvent = {
      type: 'test-event',
      payload: {},
      tags: [],
      trace_context: { session_id: 's1', trace_id: 't1' }
    };

    eventBus.subscribe('test-event', handler);
    eventBus.unsubscribe('test-event', handler);
    eventBus.publish(event);

    expect(handler).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run all tests**

Run: `npm test tests/infra/EventBus.test.ts`
Expected: ALL PASS
