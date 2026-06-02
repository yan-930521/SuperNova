# Phase 3: 任務編排與 3x3 自癒實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 Phase+Tasks 兩層任務編排，並在 Supervisor 中整合 3x3 自癒階梯（Retry & Replan）。

**Architecture:** Supervisor 作為狀態機，追蹤每個任務節點的重試計數，並在耗盡時觸發 PlanningAgent 重新規劃。

**Tech Stack:** TypeScript, Bun, EventBus

---

### Task 1: 定義 Phase 與 Task 領域模型

**Files:**
- Create: `src/domain/task/Phase.ts`
- Create: `src/domain/task/TaskNode.ts`
- Test: `src/domain/task/__tests__/Orchestration.test.ts`

- [ ] **Step 1: 撰寫任務結構測試**
```typescript
import { describe, expect, it } from "bun:test";
import { Phase } from "../Phase";
import { TaskNode } from "../TaskNode";

describe("任務編排模型", () => {
    it("Phase 應能包含多個並行的 TaskNode", () => {
        const phase = new Phase("dev");
        phase.addTask(new TaskNode("t1", "DoingAgent"));
        expect(phase.tasks.length).toBe(1);
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**

- [ ] **Step 3: 實作 TaskNode.ts 與 Phase.ts**
```typescript
// TaskNode.ts
export class TaskNode {
    public status: "pending" | "running" | "done" | "failed" = "pending";
    constructor(public id: string, public role: string) {}
}

// Phase.ts
import { TaskNode } from "./TaskNode";
export class Phase {
    public tasks: TaskNode[] = [];
    constructor(public name: string) {}
    addTask(task: TaskNode) { this.tasks.push(task); }
    isDone() { return this.tasks.every(t => t.status === "done"); }
}
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/domain/task/ ; git commit -m "feat: define Phase and TaskNode models"`

---

### Task 2: 實作 Supervisor 的 3x3 自癒邏輯

**Files:**
- Modify: `src/agent/roles/SupervisorAgent.ts`
- Test: `src/agent/roles/__tests__/SelfHealing.test.ts`

- [ ] **Step 1: 撰寫 3x3 自癒測試**
```typescript
import { describe, expect, it, mock } from "bun:test";
import { SupervisorAgent } from "../SupervisorAgent";
import { MessageBus } from "../../../core/messaging/MessageBus";
import { EventType } from "../../../core/messaging/EventTypes";

describe("3x3 自癒", () => {
    it("失敗 3 次後應觸發 Planning.Start", () => {
        const bus = new MessageBus();
        const publishSpy = mock((t, p) => {});
        bus.publish = publishSpy;
        const supervisor = new SupervisorAgent(bus);
        
        // 模擬 3 次失敗
        for(let i=0; i<3; i++) {
            bus.publish(EventType.Doing.Fail, { taskId: "t1" });
        }
        // 第 4 次失敗
        bus.publish(EventType.Doing.Fail, { taskId: "t1" });
        
        expect(publishSpy).toHaveBeenCalledWith(EventType.Planning.Start, expect.anything());
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**

- [ ] **Step 3: 修改 SupervisorAgent.ts 增加自癒計數**
```typescript
private retryMap: Map<string, number> = new Map();

protected setupSubscriptions() {
    // ... 原有訂閱
    this.bus.subscribe(EventType.Doing.Fail, (p) => this.handleFailure(p));
}

private handleFailure(payload: any) {
    const count = (this.retryMap.get(payload.taskId) || 0) + 1;
    if (count <= 3) {
        this.retryMap.set(payload.taskId, count);
        this.bus.publish(EventType.Doing.Start, payload); // 重試
    } else {
        this.bus.publish(EventType.Planning.Start, { reason: "retry_exhausted" }); // 重規劃
    }
}
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/agent/roles/SupervisorAgent.ts ; git commit -m "feat: implement 3x3 self-healing ladder"`
