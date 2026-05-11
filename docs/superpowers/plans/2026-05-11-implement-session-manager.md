# Implement SessionManager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SessionManager` to handle the lifecycle of `ISession` instances, including creation from JSON, restoration from snapshots, and basic management (finding, deleting).

**Architecture:** `SessionManager` will implement `ISessionManager` and use an internal `Map<string, ISession>` to keep track of active sessions. It will use `BaseSession` for instantiation.

**Tech Stack:** TypeScript, Jest.

---

### Task 1: Scaffolding SessionManager and Basic Tests

**Files:**
- Create: `src/infra/SessionManager.ts`
- Create: `tests/infra/SessionManager.test.ts`

- [ ] **Step 1: Write failing tests for SessionManager**

```typescript
import { SessionManager } from '../../src/infra/SessionManager';
import { BaseSession } from '../../src/session/BaseSession';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('should create a session from JSON', async () => {
    const json = { id: 'test-id', goal: 'test-goal', status: 'IDLE' };
    const session = await manager.createFromJSON(json);

    expect(session).toBeDefined();
    expect(session.id).toBe('test-id');
    expect(session.goal).toBe('test-goal');
    expect(session.status).toBe('IDLE');
    
    const found = manager.getSession('test-id');
    expect(found).toBe(session);
  });

  it('should restore a session from a snapshot', async () => {
    const json = { id: 'snap-id', goal: 'snap-goal', status: 'ACTIVE' };
    const snapshot = JSON.stringify(json);
    const session = await manager.restoreFromSnapshot(snapshot);

    expect(session).toBeDefined();
    expect(session.id).toBe('snap-id');
    expect(manager.getSession('snap-id')).toBe(session);
  });

  it('should maintain multiple independent sessions', async () => {
    await manager.createFromJSON({ id: 's1', goal: 'g1' });
    await manager.createFromJSON({ id: 's2', goal: 'g2' });

    expect(manager.getSession('s1')).toBeDefined();
    expect(manager.getSession('s2')).toBeDefined();
    expect(manager.getSession('s1')).not.toBe(manager.getSession('s2'));
  });

  it('should delete a session', async () => {
    await manager.createFromJSON({ id: 'to-delete', goal: 'none' });
    expect(manager.getSession('to-delete')).toBeDefined();

    manager.deleteSession('to-delete');
    expect(manager.getSession('to-delete')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/infra/SessionManager.test.ts`
Expected: FAIL (SessionManager not defined)

- [ ] **Step 3: Implement SessionManager**

```typescript
import { ISessionManager } from '../../interfaces/infra/ISessionManager';
import { ISession } from '../../interfaces/session/ISession';
import { BaseSession } from '../session/BaseSession';

/**
 * SessionManager 實作
 * 負責管理 Session 的生命週期，包括創建、恢復與銷毀。
 */
export class SessionManager implements ISessionManager {
  private sessions: Map<string, ISession> = new Map();

  /**
   * 從 JSON 數據創建一個新的會話實例
   * @param json 會話的序列化數據
   */
  async createFromJSON(json: Record<string, any>): Promise<ISession> {
    const id = json.id || `session-${Date.now()}`;
    const goal = json.goal || 'No goal specified';
    
    const session = new BaseSession(id, goal);
    await session.loadFromJSON(json);
    
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * 從快照恢復會話
   * @param snapshot 序列化後的會照快照（目前預期為 JSON 字符串）
   */
  async restoreFromSnapshot(snapshot: string): Promise<ISession> {
    const json = JSON.parse(snapshot);
    return this.createFromJSON(json);
  }

  /**
   * 獲取指定 ID 的會話
   * @param id 會話 ID
   */
  getSession(id: string): ISession | undefined {
    return this.sessions.get(id);
  }

  /**
   * 刪除指定 ID 的會話
   * @param id 會話 ID
   */
  deleteSession(id: string): void {
    this.sessions.delete(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/infra/SessionManager.test.ts`
Expected: PASS

- [ ] **Step 5: Verify integration with existing interfaces**

Check if `ISessionManager` needs updates if I added `getSession` and `deleteSession`. 
Actually, the prompt said: "提供管理 Session 生命週期的基礎方法（查找、刪除）".
If they are not in `ISessionManager`, I should probably add them to the interface to be consistent.

- [ ] **Step 6: Update ISessionManager if necessary**

```typescript
// interfaces/infra/ISessionManager.ts
export interface ISessionManager {
  createFromJSON(json: Record<string, any>): Promise<ISession>;
  restoreFromSnapshot(snapshot: string): Promise<ISession>;
  getSession(id: string): ISession | undefined; // Added
  deleteSession(id: string): void; // Added
}
```

- [ ] **Step 7: Final verification and commit**
