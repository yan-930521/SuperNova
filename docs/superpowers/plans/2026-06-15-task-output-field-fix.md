# Task Output Field Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `result` to `output` in TaskDTO, add `output` to Task entity, and ensure consistency across DTO conversion and execution result absorption.

**Architecture:** Update Domain (Task entity) and Infra (TaskDTO) to align with the design document, ensuring data integrity during serialization and execution.

**Tech Stack:** TypeScript

---

### Task 1: Update TaskDTO Type Definition

**Files:**
- Modify: `src/infra/types/task.ts`

- [ ] **Step 1: Rename `result` to `output` in `TaskDTO`**

```typescript
// src/infra/types/task.ts

export interface TaskDTO {
  // ... existing fields ...
  /** 執行產出的結果數據 */
  output?: string; // Was result
  // ... existing fields ...
}
```

- [ ] **Step 2: Commit**

```bash
git add src/infra/types/task.ts
git commit -m "refactor(task): rename result to output in TaskDTO"
```

### Task 2: Update Task Entity

**Files:**
- Modify: `src/domain/task/Task.ts`

- [ ] **Step 1: Add `output` property to `Task` class**

```typescript
// src/domain/task/Task.ts

export class Task extends BaseSession {
  // ... existing properties ...
  /** 執行產出的結果數據 */
  public output: string = '';
  // ...
}
```

- [ ] **Step 2: Update `absorbExecuteResult` to sync `output`**

```typescript
// src/domain/task/Task.ts

  public absorbExecuteResult(aeResult: IAgentExecuteResult): void {
    if (aeResult.result) {
      if (aeResult.result.history) {
        this.history.push(...aeResult.result.history);
      }
      // 確保執行結果摘要同步到 output
      if (aeResult.result.summary) {
        this.output = aeResult.result.summary;
      }
    }
    
    if (aeResult.status === 'success') {
      this.updateStatus('completed');
    } else {
      this.updateStatus('failed');
      this.metadata.lastError = aeResult.error;
    }
  }
```

- [ ] **Step 3: Update `fromDTO` to include `output`**

```typescript
// src/domain/task/Task.ts

  public static fromDTO(dto: TaskDTO): Task {
    // ...
    task.context = dto.context || '';
    task.output = dto.output || ''; // Add this line
    
    // ...
  }
```

- [ ] **Step 4: Update `toDTO` to include `output`**

```typescript
// src/domain/task/Task.ts

  public toDTO(): TaskDTO {
    return {
      // ...
      context: this.context,
      output: this.output, // Add this line
      type: this.type,
      // ...
    };
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/task/Task.ts
git commit -m "feat(task): add output field to Task entity and sync with DTO"
```

### Task 3: Update Verification Script

**Files:**
- Modify: `scripts/verify-task-entity.ts`

- [ ] **Step 1: Update `verify-task-entity.ts` to include `output` verification**

```typescript
// scripts/verify-task-entity.ts

  // ...
  task.context = "This is the assembled context content";
  task.output = "Final task execution output"; // Add this

  console.log("✅ Task entity created and new fields set.");
  // ...
  if (dto.context !== task.context) {
    console.error("❌ Error: DTO context mismatch");
    errors++;
  }
  if (dto.output !== task.output) { // Add this
    console.error("❌ Error: DTO output mismatch");
    errors++;
  }
  // ...
  if (restoredTask.context !== task.context) {
    console.error("❌ Error: Restored context mismatch");
    errors++;
  }
  if (restoredTask.output !== task.output) { // Add this
    console.error("❌ Error: Restored output mismatch");
    errors++;
  }
  // ...
```

- [ ] **Step 2: Run the verification script**

Run: `bun scripts/verify-task-entity.ts`
Expected: `🎉 All verifications passed! Task Entity enhancement successful.`

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-task-entity.ts
git commit -m "test(task): update verification script to include output field"
```
