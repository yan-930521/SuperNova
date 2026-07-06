# Design Doc: TaskGraph Circular Detection & Optimization

## 1. Goal
Implement circular dependency detection using Kahn's Algorithm and optimize task retrieval by PDCA phase in `TaskGraph`.

## 2. Architecture Changes

### 2.1 Cycle Detection (Kahn's Algorithm)
- **Class:** `TaskGraph`
- **Method:** `detectCycle(): boolean`
- **Logic:**
    - Calculate structural in-degrees for all nodes in `nodes`.
    - Use a queue to process all nodes with in-degree 0.
    - Increment a counter for each processed node.
    - If `counter !== totalNodes`, a cycle exists.
- **Integration:** 
    - `addDependency(parentId, childId)` will call `detectCycle()` after adding the edge.
    - If `detectCycle()` returns true, it reverts the `adjList` and `inDegreeMap` changes and throws `Error("Circular dependency detected")`.

### 2.2 Phase-based Task Retrieval
- **Class:** `TaskGraph`
- **Method:** `getReadyTasks(phase?: string): Task[]`
- **Logic:**
    - Filter tasks where `inDegree === 0` and `status` is `pending` or `ready`.
    - If `phase` is provided, additionally filter by `task.flow.currentPhase === phase`.

## 3. Data Flow
- When a `PlanningAgent` adds a dependency between two sub-tasks, `TaskGraph` validates the structure.
- When `SupervisorAgent` runs a `Tick`, it calls `getReadyTasks(currentPhase)` to find executable tasks for the current PDCA stage.

## 4. Testing
- **Framework:** `bun test`
- **Test File:** `src/domain/task/TaskGraph.test.ts`
- **Scenarios:**
    - Simple cycle: A -> B -> A.
    - Multi-node cycle: A -> B -> C -> A.
    - Phase filtering: Task A (PLANNING), Task B (DOING), both ready -> `getReadyTasks('PLANNING')` only returns A.

## 5. Success Criteria
- `detectCycle()` correctly identifies loops.
- `addDependency` prevents loops.
- `getReadyTasks` returns correct tasks based on phase.
- All tests pass.
