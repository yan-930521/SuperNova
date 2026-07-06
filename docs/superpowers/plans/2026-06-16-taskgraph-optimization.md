# TaskGraph Circular Detection & Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement circular dependency detection using Kahn's Algorithm and optimize task retrieval by PDCA phase in `TaskGraph`.

**Architecture:** 
- **Kahn's Algorithm:** Implements a topological sort on a temporary structural in-degree map to detect cycles.
- **Cycle Prevention:** Integrates detection into `addDependency` to prevent illegal edges.
- **Phase Filtering:** Enhances `getReadyTasks` to support filtering by PDCA phase (`task.flow.currentPhase`).

**Tech Stack:** TypeScript, Bun Test

---

### Task 1: Setup Test Suite

**Files:**
- Create: `src/domain/task/TaskGraph.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { expect, test, describe, beforeEach } from "bun:test";
import { TaskGraph } from "./TaskGraph";
import { Task } from "./Task";
import { StandardFlow } from "./flow/StandardFlow";

describe("TaskGraph", () => {
  let graph: TaskGraph;

  beforeEach(() => {
    graph = new TaskGraph("test-graph");
  });

  test("should add tasks and basic dependencies", () => {
    const taskA = new Task("A", "trace", "session", "goal A", "desc A");
    taskA.flow = new StandardFlow();
    const taskB = new Task("B", "trace", "session", "goal B", "desc B");
    taskB.flow = new StandardFlow();
    
    graph.addTask(taskA);
    graph.addTask(taskB);
    graph.addDependency("A", "B");
    
    const readyTasks = graph.getReadyTasks();
    expect(readyTasks.length).toBe(1);
    expect(readyTasks[0].id).toBe("A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/task/TaskGraph.test.ts`
Expected: PASS (Basic functionality already exists, but good to verify setup)

- [ ] **Step 3: Commit**

```bash
git add src/domain/task/TaskGraph.test.ts
git commit -m "test: setup TaskGraph test suite"
```

---

### Task 2: Implement Kahn's Algorithm for Cycle Detection

**Files:**
- Modify: `src/domain/task/TaskGraph.ts`
- Test: `src/domain/task/TaskGraph.test.ts`

- [ ] **Step 1: Write the failing test for cycle detection**

Add to `src/domain/task/TaskGraph.test.ts`:
```typescript
  test("detectCycle should return true for a simple cycle", () => {
    const taskA = new Task("A", "trace", "session", "goal A", "desc A");
    taskA.flow = new StandardFlow();
    const taskB = new Task("B", "trace", "session", "goal B", "desc B");
    taskB.flow = new StandardFlow();
    
    graph.addTask(taskA);
    graph.addTask(taskB);
    
    // Manually create a cycle in adjList for testing detectCycle directly
    // (Since addDependency currently uses DFS)
    (graph as any).adjList.get("A").add("B");
    (graph as any).adjList.get("B").add("A");
    
    expect(graph.detectCycle()).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/task/TaskGraph.test.ts`
Expected: FAIL (detectCycle not implemented)

- [ ] **Step 3: Implement detectCycle using Kahn's Algorithm**

In `src/domain/task/TaskGraph.ts`, add:
```typescript
  /**
   * 使用 Kahn's Algorithm 偵測圖中是否存在死循環
   * @returns boolean 是否存在死循環
   */
  public detectCycle(): boolean {
    const nodes = Array.from(this.nodes.keys());
    const tempInDegree = new Map<string, number>();
    
    // 1. 初始化所有節點的結構入度為 0
    for (const nodeId of nodes) {
      tempInDegree.set(nodeId, 0);
    }
    
    // 2. 根據目前相鄰串列計算入度
    for (const [parentId, children] of this.adjList.entries()) {
      for (const childId of children) {
        tempInDegree.set(childId, (tempInDegree.get(childId) || 0) + 1);
      }
    }
    
    // 3. 將入度為 0 的節點放入佇列
    const queue: string[] = [];
    for (const [nodeId, inDegree] of tempInDegree.entries()) {
      if (inDegree === 0) {
        queue.push(nodeId);
      }
    }
    
    // 4. 開始拓撲排序
    let visitedCount = 0;
    while (queue.length > 0) {
      const u = queue.shift()!;
      visitedCount++;
      
      const children = this.adjList.get(u);
      if (children) {
        for (const v of children) {
          const newInDegree = tempInDegree.get(v)! - 1;
          tempInDegree.set(v, newInDegree);
          if (newInDegree === 0) {
            queue.push(v);
          }
        }
      }
    }
    
    // 5. 若訪問到的節點數不等於總節點數，則存在死循環
    return visitedCount !== nodes.length;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/task/TaskGraph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/task/TaskGraph.ts
git commit -m "feat: implement detectCycle using Kahn's Algorithm"
```

---

### Task 3: Replace DFS with Kahn's Algorithm in addDependency

**Files:**
- Modify: `src/domain/task/TaskGraph.ts`
- Test: `src/domain/task/TaskGraph.test.ts`

- [ ] **Step 1: Write the failing test for circular dependency prevention**

Add to `src/domain/task/TaskGraph.test.ts`:
```typescript
  test("addDependency should throw error on circular dependency", () => {
    const taskA = new Task("A", "trace", "session", "goal A", "desc A");
    taskA.flow = new StandardFlow();
    const taskB = new Task("B", "trace", "session", "goal B", "desc B");
    taskB.flow = new StandardFlow();
    
    graph.addTask(taskA);
    graph.addTask(taskB);
    
    graph.addDependency("A", "B");
    expect(() => graph.addDependency("B", "A")).toThrow("Circular dependency detected");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/task/TaskGraph.test.ts`
Expected: FAIL (Currently throws with "Circular dependency detected" from isReachable, but we want to ensure it's using Kahn's. Actually, it will pass, but we will replace the logic)

- [ ] **Step 3: Update addDependency and remove isReachable**

In `src/domain/task/TaskGraph.ts`:
- Replace `isReachable` call with `detectCycle`.
- Remove `isReachable` method.

```typescript
  /**
   * 建立依賴關係
   */
  public addDependency(parentId: string, childId: string): void {
    if (!this.nodes.has(parentId) || !this.nodes.has(childId)) {
      throw new Error(`[TaskGraph] Node ${parentId} or ${childId} not found`);
    }

    const children = this.adjList.get(parentId)!;
    if (children.has(childId)) return; // 避免重複添加

    // 嘗試添加
    children.add(childId);
    const currentInDegree = this.inDegreeMap.get(childId) || 0;
    this.inDegreeMap.set(childId, currentInDegree + 1);

    // 偵測死循環
    if (this.detectCycle()) {
      // 還原
      children.delete(childId);
      this.inDegreeMap.set(childId, currentInDegree);
      throw new Error(`[TaskGraph] Circular dependency detected: ${parentId} -> ${childId}`);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/domain/task/TaskGraph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/task/TaskGraph.ts
git commit -m "feat: replace DFS with Kahn's Algorithm in addDependency"
```

---

### Task 4: Optimize getReadyTasks with Phase Filtering

**Files:**
- Modify: `src/domain/task/TaskGraph.ts`
- Test: `src/domain/task/TaskGraph.test.ts`

- [ ] **Step 1: Write the failing test for phase filtering**

Add to `src/domain/task/TaskGraph.test.ts`:
```typescript
  test("getReadyTasks should filter by PDCA phase", () => {
    const taskA = new Task("A", "trace", "session", "goal A", "desc A");
    taskA.flow = new StandardFlow();
    taskA.flow.currentPhase = "PLANNING";
    
    const taskB = new Task("B", "trace", "session", "goal B", "desc B");
    taskB.flow = new StandardFlow();
    taskB.flow.currentPhase = "DOING";
    
    graph.addTask(taskA);
    graph.addTask(taskB);
    
    expect(graph.getReadyTasks("PLANNING").length).toBe(1);
    expect(graph.getReadyTasks("PLANNING")[0].id).toBe("A");
    expect(graph.getReadyTasks("DOING").length).toBe(1);
    expect(graph.getReadyTasks("DOING")[0].id).toBe("B");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/task/TaskGraph.test.ts`
Expected: FAIL (Argument of type 'string' is not assignable to parameter of type 'void')

- [ ] **Step 3: Update getReadyTasks implementation**

In `src/domain/task/TaskGraph.ts`:
```typescript
  /**
   * 獲取目前就緒的任務 (入度為 0)
   * @param phase 可選，根據 PDCA 階段過濾
   */
  public getReadyTasks(phase?: string): Task[] {
    const readyTasks: Task[] = [];
    for (const [taskId, inDegree] of this.inDegreeMap.entries()) {
      if (inDegree === 0) {
        const task = this.nodes.get(taskId);
        // 只有處於待命狀態的任務才算 Ready
        if (task && (task.status === 'pending' || task.status === 'ready')) {
          // 若提供 phase，則比對 PDCA 階段
          if (!phase || task.flow.currentPhase === phase) {
            readyTasks.push(task);
          }
        }
      }
    }
    return readyTasks;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/domain/task/TaskGraph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/task/TaskGraph.ts
git commit -m "feat: optimize getReadyTasks with PDCA phase filtering"
```
