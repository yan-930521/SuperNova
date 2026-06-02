# Phase 2: 層級記憶體系統實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 L1 (Blackboard), L2 (Fact), L3 (SOP) 三層記憶體體系，並支援 Key-Only 注入協議。

**Architecture:** Blackboard 作為 L1 緩存，L2/L3 作為持久化知識庫，透過 Supervisor 進行預載入。

**Tech Stack:** TypeScript, Bun, FileSystem

---

### Task 1: 實作 L1 Blackboard (黑板系統)

**Files:**
- Create: `src/application/memory/Blackboard.ts`
- Test: `src/application/memory/__tests__/Blackboard.test.ts`

- [ ] **Step 1: 撰寫黑板讀寫測試**
```typescript
import { describe, expect, it } from "bun:test";
import { Blackboard } from "../Blackboard";

describe("Blackboard L1", () => {
    it("應能正確讀寫變數與列出 Key", () => {
        const bb = new Blackboard();
        bb.write("test_key", "val");
        expect(bb.read("test_key")).toBe("val");
        expect(bb.listKeys()).toContain("test_key");
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**

- [ ] **Step 3: 實作 Blackboard.ts**
```typescript
export class Blackboard {
    private data: Map<string, any> = new Map();
    write(key: string, value: any) { this.data.set(key, value); }
    read(key: string) { return this.data.get(key) || null; }
    listKeys() { return Array.from(this.data.keys()); }
    getMetadata(key: string) { return { key, type: typeof this.data.get(key) }; }
}
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/application/memory/Blackboard.ts ; git commit -m "feat: implement L1 Blackboard system"`

---

### Task 2: 實作 L2 事實層與 L3 SOP 層持久化

**Files:**
- Create: `src/infra/persistence/MemoryRepository.ts`
- Test: `src/infra/persistence/__tests__/MemoryRepository.test.ts`

- [ ] **Step 1: 撰寫持久化存取測試**
```typescript
import { describe, expect, it } from "bun:test";
import { MemoryRepository } from "../MemoryRepository";

describe("MemoryRepository", () => {
    it("應能存取 L2 事實與 L3 SOP", async () => {
        const repo = new MemoryRepository("workspace/test_mem");
        await repo.saveFact("db_ip", "127.0.0.1");
        const val = await repo.loadFact("db_ip");
        expect(val).toBe("127.0.0.1");
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**

- [ ] **Step 3: 實作 MemoryRepository.ts**
```typescript
import { BunFile } from "bun";
import { join } from "path";

export class MemoryRepository {
    constructor(private readonly basePath: string) {}
    async saveFact(key: string, value: any) {
        await Bun.write(join(this.basePath, "L2", `${key}.json`), JSON.stringify(value));
    }
    async loadFact(key: string) {
        const file = Bun.file(join(this.basePath, "L2", `${key}.json`));
        return await file.json();
    }
    async saveSOP(id: string, content: string) {
        await Bun.write(join(this.basePath, "L3", `${id}.md`), content);
    }
}
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/infra/persistence/MemoryRepository.ts ; git commit -m "feat: implement L2/L3 persistent storage"`

---

### Task 3: 實作 Supervisor 的預載入 (Pre-loading) 邏輯

**Files:**
- Modify: `src/agent/roles/SupervisorAgent.ts`
- Test: `src/agent/roles/__tests__/SupervisorPreloading.test.ts`

- [ ] **Step 1: 撰寫預載入測試**
```typescript
import { describe, expect, it, mock } from "bun:test";
import { SupervisorAgent } from "../SupervisorAgent";
import { Blackboard } from "../../../application/memory/Blackboard";
import { MessageBus } from "../../../core/messaging/MessageBus";

describe("Supervisor 預載入", () => {
    it("啟動任務時應在黑板注入 L2 索引", async () => {
        const bb = new Blackboard();
        const bus = new MessageBus();
        const supervisor = new SupervisorAgent(bus, bb);
        
        await supervisor.initTask({ domain: "db" });
        expect(bb.listKeys()).toContain("db_ip_ref");
    });
});
```

- [ ] **Step 2: 執行測試並確認失敗**

- [ ] **Step 3: 修改 SupervisorAgent.ts 增加預載入**
```typescript
// 增加 initTask 方法，從 L2/L3 抓取索引填入黑板
async initTask(context: any) {
    // 模擬從 L2 抓取與 domain 相關的 keys
    const relatedKeys = ["db_ip_ref", "db_port_ref"]; 
    relatedKeys.forEach(key => this.blackboard.write(key, { ref: "L2" }));
}
```

- [ ] **Step 4: 執行測試並確認通過**

- [ ] **Step 5: Commit**
`git add src/agent/roles/SupervisorAgent.ts ; git commit -m "feat: implement memory pre-loading in Supervisor"`
