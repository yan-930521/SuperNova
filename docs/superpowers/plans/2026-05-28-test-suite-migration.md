# Test Suite Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the test suite from Jest to `bun test` to align with the project's move to Bun.

**Architecture:** Update test files to use `bun:test` imports or Bun-compatible mocking. Replace `jest` specific calls with their Bun equivalents where necessary.

**Tech Stack:** Bun, TypeScript, `bun:test`

---

### Task 1: Research and Initial Run

**Files:**
- N/A

- [ ] **Step 1: Run existing tests with bun test**
    Run: `bun test`
    Expected: See failures related to `jest` not being defined or `jest.mock` usage.

### Task 2: Fix Incompatibilities in Infrastructure Tests

**Files:**
- Modify: `tests/infra/PulseEngine.test.ts`
- Modify: `tests/infra/PulseEngineMonitoring.test.ts`
- Modify: `tests/infra/PulseEnginePlugin.test.ts`

- [ ] **Step 1: Update PulseEngine.test.ts**
    Add `import { expect, describe, it, beforeEach, afterEach, jest } from "bun:test";` at the top.
- [ ] **Step 2: Update PulseEngineMonitoring.test.ts**
    Add `import { expect, describe, it, beforeEach, afterEach, jest } from "bun:test";` at the top.
- [ ] **Step 3: Update PulseEnginePlugin.test.ts**
    Add `import { expect, describe, it, beforeEach, afterEach, jest } from "bun:test";` at the top.

### Task 3: Fix Incompatibilities in Manager Tests

**Files:**
- Modify: `tests/manager/TaskManagerJIT.test.ts`
- Modify: `tests/manager/TaskManagerTimeout.test.ts`

- [ ] **Step 1: Update TaskManagerJIT.test.ts**
    Add `import { expect, describe, it, beforeEach, jest, mock } from "bun:test";`
    Update `jest.mock` to use Bun's `mock.module` or provide a factory function to `jest.mock`.
- [ ] **Step 2: Update TaskManagerTimeout.test.ts**
    Add `import { expect, test, describe, it, beforeEach, afterEach, jest } from "bun:test";`

### Task 4: Cleanup and Verification

**Files:**
- Delete: `jest.config.js`

- [ ] **Step 1: Delete jest.config.js**
    Run: `rm jest.config.js`
- [ ] **Step 2: Run all tests with bun test**
    Run: `bun test`
    Expected: All tests pass.
- [ ] **Step 3: Commit changes**
    Run: `git rm jest.config.js && git add tests/ && git commit -m "test: migrate runner to bun test"`

---
