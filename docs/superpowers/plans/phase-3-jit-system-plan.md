# Phase 3: JIT Task System & Pulse Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "3x3 Self-Healing" JIT mechanism and unify the Pulse Engine.

**Architecture:** Ladder-based escalation (Retry -> Re-plan -> Human Intervention).

**Tech Stack:** Bun, TypeScript, LangGraph, EventBus.

---

### Task 1: Pulse Engine Refinement & TaskManager Integration

**Files:**
- Modify: `src/infra/PulseEngine.ts`
- Modify: `src/manager/TaskManager.ts`

- [x] **Step 1: Implement Heartbeat & Timeout in PulseEngine**
- [x] **Step 2: Integrate PulseEngine with TaskManager execution loop**
- [x] **Step 3: Verify basic event-driven task failure detection**

### Task 2: Implement 3x3 Local Retry Logic

**Files:**
- Modify: `src/manager/TaskManager.ts`
- Modify: `src/infra/types/task.ts`

- [x] **Step 1: Update TaskDTO to include retry tracking**
- [x] **Step 2: Add retry logic in `handleTaskFailure`**
  - If `retryCount < maxRetries`, increment and set status to `READY`.
- [x] **Step 3: Update `executeNode` to trigger heartbeat updates**

### Task 3: Implement Cognitive Re-planning (Level 2)

**Files:**
- Modify: `src/task/TaskPlanner.ts`
- Modify: `src/manager/TaskManager.ts`
- Create: `prompts/planning/replan.md`

- [x] **Step 1: Create `replan` prompt and schema in `TaskPlanner`**
- [x] **Step 2: Add `replan` node to LangGraph workflow**
- [x] **Step 3: Implement `applyGraphMutation` in `TaskManager`**
  - Handle adding/modifying nodes in the live `TaskGraph`.

### Task 4: Terminal Failure & STUCK State

**Files:**
- Modify: `src/infra/types/task.ts`
- Modify: `src/manager/TaskManager.ts`

- [x] **Step 1: Define `STUCK` status in `ChainStatus`**
- [x] **Step 2: Implement replan counter and termination logic**

### Task 5: Verification & Integration Test

- [ ] **Step 1: Create `tests/integration/SelfHealing.test.ts`** (Mock tests failed, user will perform real LLM verification)
- [ ] **Step 2: Simulate failure and verify retry loop**
- [ ] **Step 3: Simulate 3x failure and verify re-plan trigger**

