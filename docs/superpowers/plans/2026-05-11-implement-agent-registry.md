# AgentRegistry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `AgentRegistry` component to manage Agent instances and support dynamic loading from JSON.

**Architecture:** `AgentRegistry` implements `IAgentRegistry` using an internal `Map` for storage and a factory-like logic in `loadAgentFromJSON`.

**Tech Stack:** TypeScript, Jest

---

### Task 1: Scaffolding and Basic Registration

**Files:**
- Create: `src/infra/AgentRegistry.ts`
- Create: `tests/infra/AgentRegistry.test.ts`

- [ ] **Step 1: Write the failing test for basic registration**

```typescript
import { AgentRegistry } from '../../src/infra/AgentRegistry';
import { BaseAgent } from '../../src/agent/BaseAgent';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  test('should register and retrieve an agent', () => {
    const agent = new BaseAgent();
    // Manually setting ID for test if needed, but BaseAgent.initFromJSON is better
    const config = { id: 'test-agent', role: 'tester' };
    agent.initFromJSON(config);

    registry.register(agent);
    expect(registry.getAgent('test-agent')).toBe(agent);
  });

  test('should return undefined for non-existent agent', () => {
    expect(registry.getAgent('non-existent')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/infra/AgentRegistry.test.ts`
Expected: FAIL (Cannot find module '../../src/infra/AgentRegistry')

- [ ] **Step 3: Write minimal implementation for registration**

```typescript
import { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';
import { IAgent } from '../../interfaces/agent/IAgent';

export class AgentRegistry implements IAgentRegistry {
  private agents: Map<string, IAgent> = new Map();

  register(agent: IAgent): void {
    this.agents.set(agent.id, agent);
  }

  getAgent(id: string): IAgent | undefined {
    return this.agents.get(id);
  }

  async loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent> {
    throw new Error('Not implemented');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/infra/AgentRegistry.test.ts`
Expected: PASS

---

### Task 2: Implement loadAgentFromJSON

**Files:**
- Modify: `tests/infra/AgentRegistry.test.ts`
- Modify: `src/infra/AgentRegistry.ts`

- [ ] **Step 1: Write failing test for loadAgentFromJSON**

```typescript
  test('should load and register a BaseAgent from JSON', async () => {
    const agentJson = {
      id: 'json-agent',
      role: 'json-tester',
      type: 'BASE'
    };

    const agent = await registry.loadAgentFromJSON(agentJson);
    
    expect(agent).toBeDefined();
    expect(agent.id).toBe('json-agent');
    expect(agent.role).toBe('json-tester');
    expect(registry.getAgent('json-agent')).toBe(agent);
  });

  test('should throw error for unknown agent type', async () => {
    const agentJson = {
      id: 'unknown-agent',
      type: 'UNKNOWN'
    };

    await expect(registry.loadAgentFromJSON(agentJson)).rejects.toThrow('Unknown agent type: UNKNOWN');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/infra/AgentRegistry.test.ts`
Expected: FAIL (Not implemented)

- [ ] **Step 3: Implement loadAgentFromJSON**

```typescript
  async loadAgentFromJSON(agentJson: Record<string, any>): Promise<IAgent> {
    const { type } = agentJson;
    let agent: IAgent;

    if (type === 'BASE') {
      const { BaseAgent } = await import('../agent/BaseAgent');
      agent = new BaseAgent();
    } else {
      throw new Error(`Unknown agent type: ${type}`);
    }

    await agent.initFromJSON(agentJson);
    this.register(agent);
    return agent;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/infra/AgentRegistry.test.ts`
Expected: PASS

---

### Task 3: Final Review and Cleanup

- [ ] **Step 1: Run all tests to ensure no regressions**

Run: `npm test`

- [ ] **Step 2: Check for proper comments and English logs**
