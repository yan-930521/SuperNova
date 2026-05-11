# TaskGraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a robust `TaskGraph` component for managing task dependencies and scheduling in a DAG structure.

**Architecture:** Use an adjacency list for graph representation, an in-degree map for tracking readiness, and DFS for cycle detection.

**Tech Stack:** TypeScript, Jest.

---

### Task 1: Scaffolding and Basic Node Operations

**Files:**
- Create: `src/session/TaskGraph.ts`
- Create: `tests/session/TaskGraph.test.ts`

- [ ] **Step 1: Write initial test for adding nodes**

```typescript
import { TaskGraph } from '../../src/session/TaskGraph';

describe('TaskGraph', () => {
  let graph: TaskGraph;

  beforeEach(() => {
    graph = new TaskGraph();
  });

  test('should add tasks and store metadata', () => {
    graph.addTask('task1', { data: 'test' });
    expect(graph.getReadyTasks()).toContain('task1');
    expect(graph.getInDegree('task1')).toBe(0);
  });

  test('should overwrite metadata for existing tasks', () => {
    graph.addTask('task1', { data: 'old' });
    graph.addTask('task1', { data: 'new' });
    expect(graph.getInDegree('task1')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/session/TaskGraph.test.ts`
Expected: FAIL (Module not found)

- [ ] **Step 3: Implement TaskGraph class with basic addTask and getInDegree**

```typescript
export class TaskGraph {
  private nodes = new Map<string, any>();
  private adjList = new Map<string, Set<string>>();
  private inDegreeMap = new Map<string, number>();

  addTask(taskId: string, metadata?: any): void {
    const isNew = !this.nodes.has(taskId);
    this.nodes.set(taskId, metadata);
    if (isNew) {
      this.adjList.set(taskId, new Set());
      this.inDegreeMap.set(taskId, 0);
    }
  }

  getInDegree(taskId: string): number {
    const inDegree = this.inDegreeMap.get(taskId);
    if (inDegree === undefined) {
      throw new Error(`Task ${taskId} not found in graph`);
    }
    return inDegree;
  }

  getReadyTasks(): string[] {
    const readyTasks: string[] = [];
    for (const [taskId, inDegree] of this.inDegreeMap.entries()) {
      if (inDegree === 0) {
        readyTasks.push(taskId);
      }
    }
    return readyTasks;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/session/TaskGraph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/TaskGraph.ts tests/session/TaskGraph.test.ts
git commit -m "feat: scaffold TaskGraph with basic node operations"
```

---

### Task 2: Implementing Dependencies and Cycle Detection

**Files:**
- Modify: `src/session/TaskGraph.ts`
- Modify: `tests/session/TaskGraph.test.ts`

- [ ] **Step 1: Write tests for dependencies and cycle detection**

```typescript
  test('should add dependencies and update in-degree', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addDependency('task1', 'task2');
    expect(graph.getInDegree('task1')).toBe(0);
    expect(graph.getInDegree('task2')).toBe(1);
    expect(graph.getReadyTasks()).toEqual(['task1']);
  });

  test('should throw error for circular dependencies', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addDependency('task1', 'task2');
    expect(() => graph.addDependency('task2', 'task1')).toThrow('Circular dependency detected');
  });

  test('should throw error for non-existent nodes in dependency', () => {
    graph.addTask('task1');
    expect(() => graph.addDependency('task1', 'task2')).toThrow('Task task2 not found');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/session/TaskGraph.test.ts`
Expected: FAIL (addDependency not defined)

- [ ] **Step 3: Implement addDependency with cycle detection**

```typescript
  addDependency(parentTaskId: string, childTaskId: string): void {
    if (!this.nodes.has(parentTaskId)) throw new Error(`Task ${parentTaskId} not found`);
    if (!this.nodes.has(childTaskId)) throw new Error(`Task ${childTaskId} not found`);
    
    if (this.isReachable(childTaskId, parentTaskId)) {
      throw new Error(`Circular dependency detected: ${childTaskId} -> ${parentTaskId}`);
    }

    const children = this.adjList.get(parentTaskId)!;
    if (!children.has(childTaskId)) {
      children.add(childTaskId);
      this.inDegreeMap.set(childTaskId, (this.inDegreeMap.get(childTaskId) || 0) + 1);
    }
  }

  private isReachable(start: string, target: string, visited = new Set<string>()): boolean {
    if (start === target) return true;
    visited.add(start);
    const successors = this.adjList.get(start);
    if (successors) {
      for (const successor of successors) {
        if (!visited.has(successor)) {
          if (this.isReachable(successor, target, visited)) return true;
        }
      }
    }
    return false;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/session/TaskGraph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/TaskGraph.ts tests/session/TaskGraph.test.ts
git commit -m "feat: implement dependencies and cycle detection in TaskGraph"
```

---

### Task 3: Implementing Task Completion

**Files:**
- Modify: `src/session/TaskGraph.ts`
- Modify: `tests/session/TaskGraph.test.ts`

- [ ] **Step 1: Write tests for completing tasks**

```typescript
  test('should update in-degree when task is completed', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addDependency('task1', 'task2');
    graph.completeTask('task1');
    expect(graph.getReadyTasks()).toEqual(['task2']);
    expect(graph.getInDegree('task2')).toBe(0);
  });

  test('should handle multi-level dependencies', () => {
    graph.addTask('task1');
    graph.addTask('task2');
    graph.addTask('task3');
    graph.addDependency('task1', 'task2');
    graph.addDependency('task2', 'task3');
    
    graph.completeTask('task1');
    expect(graph.getReadyTasks()).toEqual(['task2']);
    
    graph.completeTask('task2');
    expect(graph.getReadyTasks()).toEqual(['task3']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/session/TaskGraph.test.ts`
Expected: FAIL (completeTask not defined)

- [ ] **Step 3: Implement completeTask**

```typescript
  completeTask(taskId: string): void {
    if (!this.nodes.has(taskId)) {
      throw new Error(`Task ${taskId} not found`);
    }

    const successors = this.adjList.get(taskId);
    if (successors) {
      for (const successor of successors) {
        const currentInDegree = this.inDegreeMap.get(successor)!;
        this.inDegreeMap.set(successor, currentInDegree - 1);
      }
    }

    this.nodes.delete(taskId);
    this.adjList.delete(taskId);
    this.inDegreeMap.delete(taskId);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/session/TaskGraph.test.ts`
Expected: PASS

- [ ] **Step 5: Final review and commit**

```bash
git add src/session/TaskGraph.ts tests/session/TaskGraph.test.ts
git commit -m "feat: implement task completion and dynamic in-degree updates"
```
