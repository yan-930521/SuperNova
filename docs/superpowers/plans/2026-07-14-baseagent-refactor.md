# BaseAgent Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `BaseAgent.ts` as pure infrastructure, export all core components via `src/core/index.ts`, and ensure future business logic agents reside in `src/package/agent`.

**Architecture:** We replace the current PDCA-based `AgentState` with a pure lifecycle enum. `BaseAgent` will bind to `EventBus` and `InboxBuffer`, direct logs to a dedicated physical directory, track token usage, and serialize its state. All core dependencies are exported via `src/core/index.ts` to enforce a clean boundary for `src/package`.

**Tech Stack:** TypeScript, Jest, Node.js `fs/promises`

---

### Task 1: Create Core Export Boundary

**Files:**
- Create: `src/core/index.ts`

- [ ] **Step 1: Export core infrastructure components**

```typescript
// src/core/index.ts
// Export all necessary infrastructure modules for the package to use.
export * from './agent/BaseAgent';
// Note: Additional exports (like DataBlock, IBus) should be added here as they are developed
```

- [ ] **Step 2: Commit**

```bash
git add src/core/index.ts
git commit -m "feat(core): establish index.ts export boundary for core module"
```

---

### Task 2: Update Enums and Interfaces

**Files:**
- Modify: `src/core/agent/BaseAgent.ts`
- Modify: `tests/core/agent/BaseAgent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/agent/BaseAgent.test.ts
import { AgentState, UsageStats } from '../../../src/core/agent/BaseAgent';

describe('BaseAgent Types', () => {
  it('should define lifecycle AgentState', () => {
    expect(AgentState.INITIALIZING).toBe('INITIALIZING');
    expect(AgentState.IDLE).toBe('IDLE');
    expect(AgentState.BUSY).toBe('BUSY');
    expect(AgentState.SUSPENDED).toBe('SUSPENDED');
    expect(AgentState.TERMINATED).toBe('TERMINATED');
    
    expect((AgentState as any).PLAN).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: FAIL due to missing `BUSY` state and presence of old `PLAN` state in `AgentState`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/agent/BaseAgent.ts (Replace AgentState enum and add UsageStats)
export enum AgentState {
  INITIALIZING = 'INITIALIZING',
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED'
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent/BaseAgent.ts tests/core/agent/BaseAgent.test.ts
git commit -m "refactor(agent): update AgentState to pure lifecycle and add UsageStats"
```

---

### Task 3: Implement Core Initialization and Infrastructure Binding

**Files:**
- Modify: `src/core/agent/BaseAgent.ts`
- Modify: `tests/core/agent/BaseAgent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/agent/BaseAgent.test.ts
import { BaseAgent, AgentState } from '../../../src/core/agent/BaseAgent';
import { IEventBus } from '../../../src/core/messaging/IBus';
import { Config } from '../../../src/config/Config';
import { DataBlock } from '../../../src/core/messaging/DataBlock';

class TestAgent extends BaseAgent {
  // Mock class to instantiate abstract BaseAgent
}

describe('BaseAgent Initialization', () => {
  it('should bind infrastructure during initialization', () => {
    const mockEventBus = { subscribe: jest.fn(), unsubscribe: jest.fn() } as unknown as IEventBus;
    const mockConfig = { storage: { base_dir: 'logs' } } as unknown as Config;
    
    const agent = new TestAgent('test-id', mockEventBus, mockConfig);
    
    expect(agent.getState()).toBe(AgentState.INITIALIZING);
    expect(mockEventBus.subscribe).toHaveBeenCalledWith('test-id', expect.any(Function));
    expect((agent as any).inbox).toBeDefined();
    expect((agent as any).usageStats).toEqual({ promptTokens: 0, completionTokens: 0, durationMs: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/agent/BaseAgent.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { Config } from '../../config/Config';
import { LogManager } from '../infra/LogManager';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { DataBlock } from '../messaging/DataBlock';
import { IEventBus } from '../messaging/IBus';

export class InboxBuffer {
  private buffer: DataBlock[] = [];
  push(block: DataBlock) { this.buffer.push(block); }
  clear() { this.buffer = []; }
}

export abstract class BaseAgent {
  protected state: AgentState;
  protected readonly logger: LogManager;
  protected readonly inbox: InboxBuffer;
  protected readonly usageStats: UsageStats;
  protected readonly stateFilePath: string;

  constructor(
    public readonly id: string,
    protected readonly eventBus: IEventBus,
    protected readonly config: Config
  ) {
    this.state = AgentState.INITIALIZING;
    this.usageStats = { promptTokens: 0, completionTokens: 0, durationMs: 0 };
    
    this.logger = new LogManager({ agent_id: this.id, type: 'AGENT' });
    this.logger.addTransport(new ConsoleTransport('DEBUG'));
    
    const logDir = path.join(
      process.cwd(), 
      this.config.storage?.base_dir || 'logs', 
      'agents',
      this.id
    );
    this.logger.addTransport(new FileTransport('DEBUG', logDir, 'agent.log'));
    
    this.stateFilePath = path.join(logDir, 'state.json');
    this.inbox = new InboxBuffer();

    this.eventBus.subscribe(this.id, this.onMessageReceived.bind(this));
    
    this.logger.info(`[BaseAgent] Initializing agent: ${this.id}`);
  }

  protected setState(newState: AgentState): void {
    if (this.state === AgentState.TERMINATED) {
      this.logger.warn(`[BaseAgent] Attempted to change state of terminated agent ${this.id}`);
      return;
    }
    this.logger.debug(`[BaseAgent] State transition: ${this.state} -> ${newState}`);
    this.state = newState;
  }

  public getState(): AgentState { return this.state; }

  private async onMessageReceived(block: DataBlock): Promise<void> {
    if (this.state === AgentState.IDLE || this.state === AgentState.SUSPENDED) {
      await this.resume([block]);
    } else {
      this.inbox.push(block);
    }
  }

  public async suspend(): Promise<void> {}
  public async resume(dataBlocks: DataBlock[]): Promise<void> {}
  public async destroy(): Promise<void> {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent/BaseAgent.ts tests/core/agent/BaseAgent.test.ts
git commit -m "feat(agent): implement infrastructure binding and event subscription"
```

---

### Task 4: Implement Lifecycle Methods

**Files:**
- Modify: `src/core/agent/BaseAgent.ts`
- Modify: `tests/core/agent/BaseAgent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/agent/BaseAgent.test.ts
describe('BaseAgent Lifecycle', () => {
  it('should handle suspend, resume and destroy correctly', async () => {
    const mockEventBus = { subscribe: jest.fn(), unsubscribe: jest.fn() } as unknown as IEventBus;
    const mockConfig = { storage: { base_dir: 'logs' } } as unknown as Config;
    const agent = new TestAgent('test-lifecycle', mockEventBus, mockConfig);
    
    (agent as any).saveState = jest.fn().mockResolvedValue(undefined);

    await agent.suspend();
    expect(agent.getState()).toBe(AgentState.SUSPENDED);
    expect((agent as any).saveState).toHaveBeenCalled();

    const mockDataBlock = { id: '1', type: 'test' } as any;
    await agent.resume([mockDataBlock]);
    expect(agent.getState()).toBe(AgentState.BUSY);
    
    await agent.destroy();
    expect(agent.getState()).toBe(AgentState.TERMINATED);
    expect(mockEventBus.unsubscribe).toHaveBeenCalledWith('test-lifecycle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/agent/BaseAgent.ts
  // Inside BaseAgent class:

  protected async saveState(): Promise<void> {}

  public async suspend(): Promise<void> {
    await this.saveState();
    this.setState(AgentState.SUSPENDED);
    this.logger.info(`[BaseAgent] Agent suspended.`);
  }

  public async resume(dataBlocks: DataBlock[]): Promise<void> {
    if (this.state !== AgentState.SUSPENDED && this.state !== AgentState.IDLE && this.state !== AgentState.INITIALIZING) {
      this.logger.warn(`[BaseAgent] Resume ignored. Current state is ${this.state}`);
      return;
    }
    this.logger.info(`[BaseAgent] Resumed with ${dataBlocks.length} incoming DataBlocks.`);
    for (const block of dataBlocks) {
      this.inbox.push(block);
    }
    this.setState(AgentState.BUSY);
  }

  public async destroy(): Promise<void> {
    this.logger.info(`[BaseAgent] Destroying agent...`);
    this.setState(AgentState.TERMINATED);
    this.eventBus.unsubscribe(this.id);
    this.inbox.clear();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent/BaseAgent.ts tests/core/agent/BaseAgent.test.ts
git commit -m "feat(agent): implement suspend, resume and destroy lifecycle logic"
```

---

### Task 5: Implement Token Tracking

**Files:**
- Modify: `src/core/agent/BaseAgent.ts`
- Modify: `tests/core/agent/BaseAgent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/agent/BaseAgent.test.ts
describe('BaseAgent Token Tracking', () => {
  it('should accurately track token usage', () => {
    const mockEventBus = { subscribe: jest.fn(), unsubscribe: jest.fn() } as unknown as IEventBus;
    const mockConfig = { storage: { base_dir: 'logs' } } as unknown as Config;
    const agent = new TestAgent('test-tokens', mockEventBus, mockConfig);
    
    (agent as any).recordUsage(100, 50, 1500);
    expect((agent as any).usageStats.promptTokens).toBe(100);
    expect((agent as any).usageStats.completionTokens).toBe(50);
    expect((agent as any).usageStats.durationMs).toBe(1500);

    (agent as any).recordUsage(200, 100, 2000);
    expect((agent as any).usageStats.promptTokens).toBe(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: FAIL (recordUsage is not a function)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/agent/BaseAgent.ts
  // Inside BaseAgent class:
  protected recordUsage(promptTokens: number, completionTokens: number, durationMs: number): void {
    this.usageStats.promptTokens += promptTokens;
    this.usageStats.completionTokens += completionTokens;
    this.usageStats.durationMs += durationMs;
    
    const totalTokens = this.usageStats.promptTokens + this.usageStats.completionTokens;
    if (totalTokens > 100000) {
      this.logger.warn(`[BaseAgent] High token usage alert: ${totalTokens} tokens`);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent/BaseAgent.ts tests/core/agent/BaseAgent.test.ts
git commit -m "feat(agent): implement usage and token tracking"
```

---

### Task 6: Implement State Persistence

**Files:**
- Modify: `src/core/agent/BaseAgent.ts`
- Modify: `tests/core/agent/BaseAgent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/agent/BaseAgent.test.ts
import * as fs from 'fs/promises';

describe('BaseAgent Persistence', () => {
  it('should save and load state correctly', async () => {
    const mockEventBus = { subscribe: jest.fn(), unsubscribe: jest.fn() } as unknown as IEventBus;
    const mockConfig = { storage: { base_dir: 'logs' } } as unknown as Config;
    const agent = new TestAgent('test-persist', mockEventBus, mockConfig);
    
    (agent as any).setState(AgentState.IDLE);
    (agent as any).recordUsage(500, 200, 1000);
    
    // Save state
    await (agent as any).saveState();
    
    // Verify file written
    const statePath = (agent as any).stateFilePath;
    const content = await fs.readFile(statePath, 'utf-8');
    const data = JSON.parse(content);
    
    expect(data.state).toBe(AgentState.IDLE);
    expect(data.usageStats.promptTokens).toBe(500);

    // Create new agent and load state
    const agent2 = new TestAgent('test-persist', mockEventBus, mockConfig);
    await (agent2 as any).loadState();
    
    expect(agent2.getState()).toBe(AgentState.IDLE);
    expect((agent2 as any).usageStats.promptTokens).toBe(500);
    
    // Cleanup
    await fs.unlink(statePath).catch(() => {});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/agent/BaseAgent.ts
  // Inside BaseAgent class:
  protected async saveState(): Promise<void> {
    const data = {
      state: this.state,
      usageStats: this.usageStats
    };
    try {
      await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
      await fs.writeFile(this.stateFilePath, JSON.stringify(data, null, 2));
      this.logger.debug(`[BaseAgent] State saved to ${this.stateFilePath}`);
    } catch (err) {
      this.logger.error(`[BaseAgent] Failed to save state: ${err}`);
    }
  }

  public async loadState(): Promise<void> {
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const data = JSON.parse(content);
      if (data.state) this.state = data.state;
      if (data.usageStats) {
        this.usageStats.promptTokens = data.usageStats.promptTokens;
        this.usageStats.completionTokens = data.usageStats.completionTokens;
        this.usageStats.durationMs = data.usageStats.durationMs;
      }
      this.logger.info(`[BaseAgent] State loaded from ${this.stateFilePath}`);
    } catch (err) {
      this.logger.warn(`[BaseAgent] No previous state found or failed to load: ${err}`);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/core/agent/BaseAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent/BaseAgent.ts tests/core/agent/BaseAgent.test.ts
git commit -m "feat(agent): implement state persistence mechanism"
```
