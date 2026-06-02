# Phase 1: Agent 群體與事件通訊實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立五大專業角色 Agent 體系，並實現基於 EventBus 的主動路由通訊協議。

**Architecture:** 採用集中式路由（Supervisor）與非同步事件發布機制。所有 Agent 共享一個被注入的 EventBus 實例。

**Tech Stack:** TypeScript, Bun, MessageBus

---

### Task 1: 定義五大角色事件契約 (Event Contracts)

**Files:**
- Create: `src/core/messaging/EventTypes.ts`
- Modify: `src/core/messaging/IBus.ts`
- Test: `src/core/messaging/__tests__/EventTypes.test.ts`

- [ ] **Step 1: 撰寫測試驗證事件類型定義**
```typescript
import { describe, expect, it } from "bun:test";
import { EventType } from "../EventTypes";

describe("EventTypes", () => {
    it("應包含五大角色的標準事件類型", () => {
        expect(EventType.Planning.Start).toBeDefined();
        expect(EventType.Doing.Finish).toBeDefined();
        expect(EventType.Checking.Pass).toBeDefined();
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**
Run: `bun test src/core/messaging/__tests__/EventTypes.test.ts`

- [ ] **Step 3: 實作 EventTypes.ts**
```typescript
export const EventType = {
    Supervisor: { Dispatch: "Supervisor.Dispatch", Halt: "Supervisor.Halt" },
    Planning: { Start: "Planning.Start", Finish: "Planning.Finish", Fail: "Planning.Fail" },
    Doing: { Start: "Doing.Start", Finish: "Doing.Finish", Fail: "Doing.Fail" },
    Checking: { Start: "Checking.Start", Pass: "Checking.Pass", Fail: "Checking.Fail" },
    Acting: { Start: "Acting.Start", Finish: "Acting.Finish", Fail: "Acting.Fail" }
} as const;
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/core/messaging/ ; git commit -m "feat: define 5-role agent event types"`

---

### Task 2: 重構 BaseAgent 支援 EventBus 注入

**Files:**
- Modify: `src/agent/BaseAgent.ts`
- Test: `src/agent/__tests__/BaseAgent.test.ts`

- [ ] **Step 1: 撰寫測試驗證 IBus 注入**
```typescript
import { describe, expect, it } from "bun:test";
import { MessageBus } from "../../core/messaging/MessageBus";
import { BaseAgent } from "../BaseAgent";

class TestAgent extends BaseAgent {
    protected setupSubscriptions() {}
}

describe("BaseAgent 注入", () => {
    it("應成功注入 IBus 實例", () => {
        const bus = new MessageBus();
        const agent = new TestAgent(bus);
        expect(agent["bus"]).toBe(bus);
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**

- [ ] **Step 3: 修改 BaseAgent.ts**
```typescript
import { IBus } from "../core/messaging/IBus";

export abstract class BaseAgent {
    constructor(protected readonly bus: IBus) {
        this.setupSubscriptions();
    }
    protected abstract setupSubscriptions(): void;
}
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/agent/BaseAgent.ts ; git commit -m "refactor: inject IBus into BaseAgent"`

---

### Task 3: 實作 SupervisorAgent 主動路由邏輯

**Files:**
- Create: `src/agent/roles/SupervisorAgent.ts`
- Test: `src/agent/roles/__tests__/SupervisorAgent.test.ts`

- [ ] **Step 1: 撰寫路由測試**
```typescript
import { describe, expect, it, mock } from "bun:test";
import { MessageBus } from "../../../core/messaging/MessageBus";
import { SupervisorAgent } from "../SupervisorAgent";
import { EventType } from "../../../core/messaging/EventTypes";

describe("SupervisorAgent 路由", () => {
    it("收到 Planning.Finish 應發布 Doing.Start", () => {
        const bus = new MessageBus();
        const publishSpy = mock((type, payload) => {});
        bus.publish = publishSpy;
        
        new SupervisorAgent(bus);
        bus.publish(EventType.Planning.Finish, { taskId: "t1" });
        
        expect(publishSpy).toHaveBeenCalledWith(EventType.Doing.Start, { taskId: "t1" });
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**

- [ ] **Step 3: 實作 SupervisorAgent.ts**
```typescript
import { BaseAgent } from "../BaseAgent";
import { EventType } from "../../core/messaging/EventTypes";

export class SupervisorAgent extends BaseAgent {
    protected setupSubscriptions() {
        this.bus.subscribe(EventType.Planning.Finish, (p) => this.routeToDoing(p));
        this.bus.subscribe(EventType.Doing.Finish, (p) => this.routeToChecking(p));
        this.bus.subscribe(EventType.Checking.Pass, (p) => this.routeToActing(p));
    }

    private routeToDoing(payload: any) {
        this.bus.publish(EventType.Doing.Start, payload);
    }
    private routeToChecking(payload: any) {
        this.bus.publish(EventType.Checking.Start, payload);
    }
    private routeToActing(payload: any) {
        this.bus.publish(EventType.Acting.Start, payload);
    }
}
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/agent/roles/SupervisorAgent.ts ; git commit -m "feat: implement active routing in SupervisorAgent"`
