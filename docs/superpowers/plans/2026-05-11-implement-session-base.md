# Session Base Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the core session framework including a Koa-style middleware chain and a base session class.

**Architecture:** The `MiddlewareChain` manages an array of `IMiddleware` and executes them in sequence using a recursive `next()` call. The `BaseSession` implements `ISession` and provides hooks for `TOOL` and `MUTATION` pipelines.

**Tech Stack:** TypeScript, Jest

---

### Task 1: Implement MiddlewareChain

**Files:**
- Create: `src/session/MiddlewareChain.ts`
- Test: `tests/session/MiddlewareChain.test.ts`

- [ ] **Step 1: Write the failing test for MiddlewareChain**
  Verify that middlewares are executed in order and can modify context data.

```typescript
import { MiddlewareChain } from '../../src/session/MiddlewareChain';
import { IMiddleware, IMiddlewareContext } from '../../interfaces/session/IMiddleware';

describe('MiddlewareChain', () => {
  it('should execute middlewares in order', async () => {
    const chain = new MiddlewareChain();
    const sequence: number[] = [];
    
    chain.use({
      execute: async (ctx, next) => {
        sequence.push(1);
        await next();
        sequence.push(6);
      }
    });
    
    chain.use({
      execute: async (ctx, next) => {
        sequence.push(2);
        await next();
        sequence.push(5);
      }
    });
    
    const ctx: IMiddlewareContext = { session_id: '1', target: 'test', data: {} };
    await chain.execute(ctx, async () => {
      sequence.push(3);
      sequence.push(4);
    });
    
    expect(sequence).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should allow middleware to modify context data', async () => {
    const chain = new MiddlewareChain();
    chain.use({
      execute: async (ctx, next) => {
        ctx.data.modified = true;
        await next();
      }
    });
    
    const ctx: IMiddlewareContext = { session_id: '1', target: 'test', data: { modified: false } };
    await chain.execute(ctx, async () => {});
    
    expect(ctx.data.modified).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/session/MiddlewareChain.test.ts`

- [ ] **Step 3: Implement MiddlewareChain**

```typescript
import { IMiddleware, IMiddlewareContext } from '../../interfaces/session/IMiddleware';

/**
 * 中間件鏈管理器
 * 負責維護中間件列表並執行組合後的流水線。
 */
export class MiddlewareChain {
  private middlewares: IMiddleware[] = [];

  /**
   * 註冊中間件
   * @param middleware 中間件實例
   */
  use(middleware: IMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 執行中間件鏈
   * @param ctx 執行上下文
   * @param coreTask 核心任務 (所有中間件執行完後的最後一個 next)
   */
  async execute(ctx: IMiddlewareContext, coreTask: () => Promise<void>): Promise<void> {
    const dispatch = async (index: number): Promise<void> => {
      if (index === this.middlewares.length) {
        return coreTask();
      }
      const middleware = this.middlewares[index];
      await middleware.execute(ctx, () => dispatch(index + 1));
    };

    return dispatch(0);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/session/MiddlewareChain.test.ts`

### Task 2: Implement BaseSession

**Files:**
- Create: `src/session/BaseSession.ts`
- Test: `tests/session/BaseSession.test.ts`

- [ ] **Step 1: Write the failing test for BaseSession**
Verify that `use` correctly registers middlewares and `tick` (as a placeholder for core loop) exists.

```typescript
import { BaseSession } from '../../src/session/BaseSession';
import { IMiddleware } from '../../interfaces/session/IMiddleware';

describe('BaseSession', () => {
  it('should allow registering middlewares to different pipelines', () => {
    const session = new BaseSession('test-session', 'to test');
    const middleware: IMiddleware = {
      execute: async (ctx, next) => { await next(); }
    };
    
    expect(() => session.use('TOOL', middleware)).not.toThrow();
    expect(() => session.use('MUTATION', middleware)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/session/BaseSession.test.ts`

- [ ] **Step 3: Implement BaseSession**

```typescript
import { ISession } from '../../interfaces/session/ISession';
import { IMiddleware } from '../../interfaces/session/IMiddleware';
import { MiddlewareChain } from './MiddlewareChain';

/**
 * 會話基礎實作類
 * 提供 ISession 接口的核心功能，包括中間件管理。
 */
export class BaseSession implements ISession {
  public status: string = 'IDLE';
  private toolChain: MiddlewareChain = new MiddlewareChain();
  private mutationChain: MiddlewareChain = new MiddlewareChain();

  constructor(
    public id: string,
    public goal: string
  ) {}

  /**
   * 註冊中間件
   */
  use(pipeline: 'TOOL' | 'MUTATION', middleware: IMiddleware): void {
    if (pipeline === 'TOOL') {
      this.toolChain.use(middleware);
    } else {
      this.mutationChain.use(middleware);
    }
  }

  /**
   * 核心循環 (目前為佔位實作)
   */
  async tick(): Promise<void> {
    // 未來將在此處執行主循環邏輯
    console.log(`Session ${this.id} ticking...`);
  }

  async exportLog(): Promise<string> {
    return "";
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      goal: this.goal,
      status: this.status
    };
  }

  async loadFromJSON(data: Record<string, any>): Promise<void> {
    this.id = data.id;
    this.goal = data.goal;
    this.status = data.status;
  }

  async snapshot(): Promise<string> {
    return "snapshot-id";
  }

  async rollback(checkpointId: string): Promise<void> {
    console.log(`Rolling back to ${checkpointId}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/session/BaseSession.test.ts`

### Task 3: Integrated Pipeline Test

- [ ] **Step 1: Add a test case to BaseSession.test.ts to verify middleware integration**

```typescript
  it('should integrate MiddlewareChain into a mock execution flow', async () => {
    const session = new BaseSession('test-session', 'to test');
    let called = false;
    
    session.use('TOOL', {
      execute: async (ctx, next) => {
        called = true;
        await next();
      }
    });

    // 模擬一個工具調用流，這通常會在 tick() 內部發生
    // 這裡直接測試內部鏈接
    const ctx = { session_id: session.id, target: 'test-tool', data: {} };
    // @ts-ignore: Access private for testing integration
    await session.toolChain.execute(ctx, async () => {
      // Core task
    });

    expect(called).toBe(true);
  });
```

- [ ] **Step 2: Run tests**
Run: `npm test tests/session/BaseSession.test.ts`
