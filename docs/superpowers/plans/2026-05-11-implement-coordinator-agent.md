# CoordinatorAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `CoordinatorAgent` class to handle mutation arbitration and task planning placeholders.

**Architecture:** `CoordinatorAgent` extends `BaseAgent` and implements `ICoordinator`. It uses a priority-based arbitration algorithm to resolve conflicts when multiple agents propose changes to the same hook.

**Tech Stack:** TypeScript, Jest.

---

### Task 1: Create CoordinatorAgent Skeleton

**Files:**
- Create: `src/agent/CoordinatorAgent.ts`

- [ ] **Step 1: Define the CoordinatorAgent class skeleton**

```typescript
import { BaseAgent } from './BaseAgent';
import { ICoordinator } from '../../interfaces/agent/ICoordinator';
import { IMutationRequest } from '../../interfaces/models/IMutationRequest';

/**
 * CoordinatorAgent 類
 * 負責協調多個 Agent 的提議並進行衝突裁決。
 */
export class CoordinatorAgent extends BaseAgent implements ICoordinator {
  /**
   * 執行階層式衝突裁決
   * @param proposals 原始變更請求列表
   */
  async arbitrateMutations(proposals: IMutationRequest[]): Promise<IMutationRequest[]> {
    // TODO: 實作裁決邏輯
    return [];
  }

  /**
   * 基於目標生成任務的有向無環圖 (DAG)
   * @param goal 任務目標描述
   */
  async planTaskGraph(goal: string): Promise<any> {
    console.log(`[CoordinatorAgent ${this.id}] Planning task graph for goal: ${goal}`);
    return {};
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/CoordinatorAgent.ts
git commit -m "feat: add CoordinatorAgent skeleton"
```

### Task 2: Implement Arbitration Logic (TDD)

**Files:**
- Create: `tests/agent/CoordinatorAgent.test.ts`
- Modify: `src/agent/CoordinatorAgent.ts`

- [ ] **Step 1: Write failing tests for arbitration**

```typescript
import { CoordinatorAgent } from '../../src/agent/CoordinatorAgent';
import { IMutationRequest } from '../../interfaces/models/IMutationRequest';

describe('CoordinatorAgent', () => {
  let coordinator: CoordinatorAgent;

  beforeEach(async () => {
    coordinator = new CoordinatorAgent();
    await coordinator.initFromJSON({ id: 'coord-1', role: 'coordinator' });
  });

  test('should arbitrate conflicts by priority', async () => {
    const proposals: IMutationRequest[] = [
      {
        requester_id: 'agent-1',
        target_hook: 'hook-A',
        proposed_change: { val: 1 },
        priority: 10,
        version_ref: 'v1'
      },
      {
        requester_id: 'agent-2',
        target_hook: 'hook-A',
        proposed_change: { val: 2 },
        priority: 20, // Higher priority wins
        version_ref: 'v1'
      }
    ];

    const result = await coordinator.arbitrateMutations(proposals);
    expect(result).toHaveLength(1);
    expect(result[0].requester_id).toBe('agent-2');
  });

  test('should arbitrate conflicts by order if priority is same', async () => {
    const proposals: IMutationRequest[] = [
      {
        requester_id: 'agent-1',
        target_hook: 'hook-A',
        proposed_change: { val: 1 },
        priority: 10,
        version_ref: 'v1'
      },
      {
        requester_id: 'agent-2',
        target_hook: 'hook-A',
        proposed_change: { val: 2 },
        priority: 10, // Same priority, earlier wins
        version_ref: 'v1'
      }
    ];

    const result = await coordinator.arbitrateMutations(proposals);
    expect(result).toHaveLength(1);
    expect(result[0].requester_id).toBe('agent-1');
  });

  test('should allow multiple proposals for different hooks', async () => {
    const proposals: IMutationRequest[] = [
      {
        requester_id: 'agent-1',
        target_hook: 'hook-A',
        proposed_change: { val: 1 },
        priority: 10,
        version_ref: 'v1'
      },
      {
        requester_id: 'agent-2',
        target_hook: 'hook-B',
        proposed_change: { val: 2 },
        priority: 10,
        version_ref: 'v1'
      }
    ];

    const result = await coordinator.arbitrateMutations(proposals);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test tests/agent/CoordinatorAgent.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement arbitration logic**

```typescript
  async arbitrateMutations(proposals: IMutationRequest[]): Promise<IMutationRequest[]> {
    const winners = new Map<string, IMutationRequest>();

    proposals.forEach((proposal) => {
      const existing = winners.get(proposal.target_hook);
      if (!existing) {
        winners.set(proposal.target_hook, proposal);
      } else {
        // 裁決邏輯：保留 priority 最高的一個。如果優先級相同，保留最早提交的。
        if (proposal.priority > existing.priority) {
          winners.set(proposal.target_hook, proposal);
        }
        // 如果 priority 相同，因為我們是按順序遍歷，existing 已經是較早的一個，所以不更新。
      }
    });

    return Array.from(winners.values());
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/agent/CoordinatorAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/agent/CoordinatorAgent.test.ts src/agent/CoordinatorAgent.ts
git commit -m "feat: implement mutation arbitration logic"
```
