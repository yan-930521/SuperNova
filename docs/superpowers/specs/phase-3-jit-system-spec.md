# Phase 3: JIT Task System & Pulse Engine Specification

## 1. Overview
This specification covers the implementation of the "Autonomous Engine" layer in SuperNova 2.0. The goal is to move from static task execution to a dynamic, self-healing runtime driven by system pulses and just-in-time planning.

## 2. Core Components

### 2.1 Pulse Engine (The Observation Layer)
- **Pulse Action**: Emits a `SYSTEM_TICK` every 1000ms.
- **Heartbeat Monitoring**: Tracks active tasks and emits `TASK_FAILED` if a task exceeds its timeout (default 30s) without a heartbeat.
- **State Pool**: A hierarchical key-value store for system variables (e.g., `env.temp`, `worker.load`).
- **Hooks**: Triggers `INTERVAL`, `THRESHOLD`, or `EVENT` based actions.

### 2.2 JIT Task Planning (The Logic Layer)
- **Incremental Expansion**: `TaskPlanner` only expands the current milestone into tasks. Next milestones are expanded only when the current one is successfully completed.
- **3x3 Self-Healing Mechanism**:
  - **Level 1: Local Retry**: `TaskManager` retries a failed task up to 3 times.
  - **Level 2: Cognitive Re-plan**: If 3 retries fail, `TaskPlanner` performs a partial re-plan of the `TaskGraph` (cannot modify milestones).
  - **Level 3: Terminal Halt**: If re-planning fails 3 times for the same goal, mark the chain as `STUCK`.

### 2.3 Event Bus (The Communication Layer)
- Decouples components via strongly-typed events (`TASK_HEARTBEAT`, `TASK_FAILED`, `SYSTEM_TICK`).

## 3. Data Protocols
- **TaskDTO**: Added `retryCount` in metadata and `options.maxRetries`.
- **ChainState**: Added `replanCount` to track global self-healing attempts.
- **ReplanResponse**: Defines node additions, modifications, and edge removals.

## 4. Safety & Constraints
- LLM Re-planning must respect original `milestones`.
- Sandbox paths must be maintained during re-planning.
