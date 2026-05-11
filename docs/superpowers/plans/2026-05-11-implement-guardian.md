# Guardian Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `Guardian` component to provide execution isolation, timeout control, and error recovery strategy resolution for asynchronous tasks.

**Architecture:** The `Guardian` implements `IGuardian` interface. It uses `Promise.race` for timeouts and provides a strategy resolver for error handling.

**Tech Stack:** TypeScript, Jest (for testing).

---

### Task 1: Setup Directory Structure and Define TimeoutError

**Files:**
- Create: `src/runtime/Guardian.ts`

- [ ] **Step 1: Define the `TimeoutError` class and basic structure of `Guardian`**

```typescript
/**
 * 超時錯誤類
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Task execution timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

import { IGuardian } from '../../interfaces/runtime/IGuardian';

export class Guardian implements IGuardian {
  async protect<T>(task: () => Promise<T>, timeout: number): Promise<T> {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  resolveStrategy(error: Error): 'RETRY' | 'ABORT' | 'IGNORE' {
    // TODO: Implement
    throw new Error('Not implemented');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/runtime/Guardian.ts
git commit -m "feat: setup Guardian structure and TimeoutError"
```

---

### Task 2: Test-Driven Development for `protect` method (Success Case)

**Files:**
- Modify: `src/runtime/Guardian.ts`
- Create: `tests/runtime/Guardian.test.ts`

- [ ] **Step 1: Write failing test for normal task completion**

```typescript
import { Guardian, TimeoutError } from '../../src/runtime/Guardian';

describe('Guardian', () => {
  let guardian: Guardian;

  beforeEach(() => {
    guardian = new Guardian();
  });

  test('should complete a normal task successfully', async () => {
    const task = async () => 'success';
    const result = await guardian.protect(task, 1000);
    expect(result).toBe('success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/runtime/Guardian.test.ts`
Expected: FAIL (Not implemented)

- [ ] **Step 3: Implement minimal code to pass**

```typescript
  async protect<T>(task: () => Promise<T>, timeout: number): Promise<T> {
    return await task();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/runtime/Guardian.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runtime/Guardian.ts tests/runtime/Guardian.test.ts
git commit -m "test: Guardian protect success case"
```

---

### Task 3: Test-Driven Development for `protect` method (Timeout Case)

**Files:**
- Modify: `src/runtime/Guardian.ts`
- Modify: `tests/runtime/Guardian.test.ts`

- [ ] **Step 1: Write failing test for timeout**

```typescript
  test('should throw TimeoutError when task times out', async () => {
    const task = () => new Promise((resolve) => setTimeout(() => resolve('too late'), 200));
    await expect(guardian.protect(task, 100)).rejects.toThrow(TimeoutError);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/runtime/Guardian.test.ts`
Expected: FAIL (timeout exceeded but didn't throw TimeoutError)

- [ ] **Step 3: Implement timeout logic using Promise.race**

```typescript
  async protect<T>(task: () => Promise<T>, timeout: number): Promise<T> {
    let timer: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new TimeoutError(`Task timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      return await Promise.race([task(), timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/runtime/Guardian.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runtime/Guardian.ts tests/runtime/Guardian.test.ts
git commit -m "feat: implement timeout protection in Guardian"
```

---

### Task 4: Test-Driven Development for `protect` method (Exception Case)

**Files:**
- Modify: `tests/runtime/Guardian.test.ts`

- [ ] **Step 1: Write failing test for task internal error**

```typescript
  test('should propagate internal task errors', async () => {
    const task = async () => {
      throw new Error('Internal failure');
    };
    await expect(guardian.protect(task, 1000)).rejects.toThrow('Internal failure');
  });
```

- [ ] **Step 2: Run test to verify it passes (should already pass if correctly implemented)**

Run: `npx jest tests/runtime/Guardian.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/runtime/Guardian.test.ts
git commit -m "test: Guardian protect exception propagation"
```

---

### Task 5: Test-Driven Development for `resolveStrategy` method

**Files:**
- Modify: `src/runtime/Guardian.ts`
- Modify: `tests/runtime/Guardian.test.ts`

- [ ] **Step 1: Write failing tests for resolveStrategy**

```typescript
  describe('resolveStrategy', () => {
    test('should return RETRY for TimeoutError', () => {
      const error = new TimeoutError();
      expect(guardian.resolveStrategy(error)).toBe('RETRY');
    });

    test('should return ABORT for standard Error', () => {
      const error = new Error('Generic error');
      expect(guardian.resolveStrategy(error)).toBe('ABORT');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/runtime/Guardian.test.ts`
Expected: FAIL (Not implemented)

- [ ] **Step 3: Implement resolveStrategy logic**

```typescript
  resolveStrategy(error: Error): 'RETRY' | 'ABORT' | 'IGNORE' {
    if (error instanceof TimeoutError) {
      return 'RETRY';
    }
    // 預設對於未知錯誤採取中斷策略，確保系統安全
    return 'ABORT';
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/runtime/Guardian.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runtime/Guardian.ts tests/runtime/Guardian.test.ts
git commit -m "feat: implement resolveStrategy in Guardian"
```

---

### Task 6: Final Cleanup and Documentation

**Files:**
- Modify: `src/runtime/Guardian.ts`

- [ ] **Step 1: Add detailed Chinese comments to the implementation**

Ensure all methods have comments explaining logic and intent.

- [ ] **Step 2: Verify all tests one last time**

Run: `npm test` or `npx jest tests/runtime/Guardian.test.ts`

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: add comments to Guardian implementation"
```
