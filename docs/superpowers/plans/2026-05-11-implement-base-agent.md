# BaseAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `BaseAgent` component with JSON serialization and basic task/mutation handling.

**Architecture:** A concrete class implementing `IAgent` with protected fields for `id`, `role`, and a generic `config` bucket for state persistence.

**Tech Stack:** TypeScript, Jest.

---

### Task 1: Scaffolding and Interface Setup

**Files:**
- Create: `src/agent/BaseAgent.ts`
- Modify: N/A

- [ ] **Step 1: Create the file and add basic structure**

```typescript
import { IAgent } from '../../interfaces/agent/IAgent';
import { IMutationRequest } from '../../interfaces/models/IMutationRequest';

/**
 * BaseAgent 類
 * 實作 IAgent 接口，提供基礎的識別、序列化與日誌功能。
 */
export class BaseAgent implements IAgent {
  protected _id: string = '';
  protected _role: string = '';
  protected _config: Record<string, any> = {};

  get id(): string {
    return this._id;
  }

  get role(): string {
    return this._role;
  }

  /**
   * 從 JSON 配置初始化或恢復 Agent 狀態
   * @param config 配置對象
   */
  async initFromJSON(config: Record<string, any>): Promise<void> {
    const { id, role, ...rest } = config;
    this._id = id || '';
    this._role = role || '';
    this._config = rest;
  }

  /**
   * 將 Agent 當前狀態序列化為 JSON
   */
  toJSON(): Record<string, any> {
    return {
      id: this._id,
      role: this._role,
      ...this._config,
    };
  }

  /**
   * 接收並處理任務 (目前僅記錄日誌)
   * @param task 任務數據
   */
  async receiveTask(task: any): Promise<void> {
    console.log(`[BaseAgent ${this.id}] Receiving task: ${JSON.stringify(task)}`);
  }

  /**
   * 提議規則變更 (目前僅記錄日誌)
   * @param mutation 變更請求
   */
  async proposeMutation(mutation: IMutationRequest): Promise<void> {
    console.log(`[BaseAgent ${this.id}] Proposing mutation to ${mutation.target_hook}`);
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc src/agent/BaseAgent.ts --noEmit --esModuleInterop --target es2020 --moduleResolution node`
Expected: No errors.

### Task 2: Implementing Tests

**Files:**
- Create: `tests/agent/BaseAgent.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { BaseAgent } from '../../src/agent/BaseAgent';
import { IMutationRequest } from '../../interfaces/models/IMutationRequest';

describe('BaseAgent', () => {
  let agent: BaseAgent;

  beforeEach(() => {
    agent = new BaseAgent();
  });

  test('should initialize correctly from JSON', async () => {
    const config = {
      id: 'agent-001',
      role: 'worker',
      customSetting: 'enabled',
      nest: { key: 'value' }
    };

    await agent.initFromJSON(config);

    expect(agent.id).toBe('agent-001');
    expect(agent.role).toBe('worker');
    expect(agent.toJSON()).toEqual(config);
  });

  test('should handle missing id and role in config', async () => {
    await agent.initFromJSON({});
    expect(agent.id).toBe('');
    expect(agent.role).toBe('');
  });

  test('should log when receiving a task', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    await agent.initFromJSON({ id: 'test-agent' });
    
    const task = { type: 'test-task', data: 123 };
    await agent.receiveTask(task);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[BaseAgent test-agent] Receiving task:')
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(task))
    );
    
    logSpy.mockRestore();
  });

  test('should log when proposing a mutation', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    await agent.initFromJSON({ id: 'test-agent' });

    const mutation: IMutationRequest = {
      requester_id: 'test-agent',
      target_hook: 'onMessage',
      proposed_change: { newRule: true },
      priority: 10,
      version_ref: 'v1'
    };

    await agent.proposeMutation(mutation);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[BaseAgent test-agent] Proposing mutation to onMessage')
    );

    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test tests/agent/BaseAgent.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/agent/BaseAgent.ts tests/agent/BaseAgent.test.ts
git commit -m "feat: implement BaseAgent with JSON serialization and basic logging"
```
