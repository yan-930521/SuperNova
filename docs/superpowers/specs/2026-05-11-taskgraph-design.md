# TaskGraph Design Specification

## Overview
`TaskGraph` is a core component of the SuperNova session management system, responsible for maintaining a Directed Acyclic Graph (DAG) of tasks. It manages task dependencies and identifies tasks that are ready for execution based on their in-degree.

## Data Structures
- `nodes`: `Map<string, any>` - Maps `taskId` to its associated metadata.
- `adjList`: `Map<string, Set<string>>` - Adjacency list representing the graph (parent -> successors).
- `inDegreeMap`: `Map<string, number>` - Tracks the number of incoming dependencies (predecessors) for each task.

## Key Operations

### `addTask(taskId: string, metadata?: any)`
- Adds a new task node or overwrites metadata if it already exists.
- If it's a new task, initialize its in-degree to 0 and create an empty set in `adjList`.

### `addDependency(parentTaskId: string, childTaskId: string)`
- Establishes a dependency where `parentTaskId` must be completed before `childTaskId`.
- **Validation:**
  - Both tasks must exist in the graph.
  - Checks for circular dependencies before adding the edge.
- **Implementation:**
  - Add `childTaskId` to the `adjList` of `parentTaskId`.
  - Increment the value in `inDegreeMap` for `childTaskId`.

### `getInDegree(taskId: string): number`
- Returns the current in-degree of the specified task.
- Throws an error if the task does not exist.

### `getReadyTasks(): string[]`
- Returns an array of `taskId`s that have an in-degree of 0 (no pending dependencies).

### `completeTask(taskId: string)`
- Marks a task as completed and removes it from the graph.
- **Implementation:**
  - Decrement the in-degree of all successor tasks (those in `adjList.get(taskId)`).
  - Remove the task from `nodes`, `adjList`, and `inDegreeMap`.

## Cycle Detection
- Before adding an edge `A -> B`, the system checks if `A` is reachable from `B` using a Depth-First Search (DFS).
- If reachable, a circular dependency error is thrown.

## Testing Strategy
- **Unit Tests:**
  - Verify node addition and metadata storage.
  - Verify in-degree calculation for various graph structures.
  - Verify dynamic updates of in-degree when tasks are completed.
  - Verify circular dependency detection for simple and complex cycles.
  - Verify error handling for non-existent nodes.
