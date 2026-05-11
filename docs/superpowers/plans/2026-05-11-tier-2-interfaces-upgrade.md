# SuperNova Interface Tier 2 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SuperNova interfaces to Tier 2, enhancing specialization, stability, and observability while strictly adhering to the revised ARCH.md.

**Architecture:** This upgrade focuses on formalizing the middleware pipeline, specializing Agent identities, and strengthening tool safety and input validation. We move away from dynamic role switching to static, type-safe specialized agents.

**Tech Stack:** TypeScript

---

### Task 1: Update Middleware Interfaces

**Files:**
- Modify: `interfaces/session/IMiddleware.ts`

- [ ] **Step 1: Define IMiddlewareContext and update IMiddleware**

```typescript
/**
 * 中間件執行上下文
 */
export interface IMiddlewareContext {
  /** 會話 ID */
  session_id: string;
  /** 目標對象 (例如 Tool 名稱或 Agent ID) */
  target: string;
  /** 傳遞的數據 */
  data: any;
}

/**
 * 中間件接口
 * 用於在 Session 執行流水線中插入自定義邏輯。
 */
export interface IMiddleware {
  /**
   * 執行中間件邏輯
   * @param ctx 執行上下文
   * @param next 調用流水線中的下一個中間件
   */
  execute(ctx: IMiddlewareContext, next: () => Promise<void>): Promise<void>;
}
```

- [ ] **Step 2: Verify compilation**
Run: `tsc --noEmit interfaces/session/IMiddleware.ts`
Expected: PASS

---

### Task 2: Refine Session Interface

**Files:**
- Modify: `interfaces/session/ISession.ts`

- [ ] **Step 1: Update ISession to use the new 'use' method and refine pipeline types**

```typescript
import { IMiddleware } from './IMiddleware';

/**
 * 會話核心接口
 */
export interface ISession {
  /** 會話 UUID */
  id: string;
  /** 當前狀態 */
  status: string;
  /** 初始目標 */
  goal: string;
  
  /** 驅動會話運行的核心循環 */
  tick(): Promise<void>;
  
  /** 導出全鏈路操作日誌 */
  exportLog(): Promise<string>;

  /** 序列化為 JSON */
  toJSON(): Record<string, any>;
  
  /** 從 JSON 加載狀態 */
  loadFromJSON(data: Record<string, any>): Promise<void>;

  /** 
   * 創建當前會話狀態的快照 
   * @returns 快照 ID
   */
  snapshot(): Promise<string>;

  /** 
   * 將會話回滾到指定的快照點 
   * @param checkpointId 快照或檢查點 ID
   */
  rollback(checkpointId: string): Promise<void>;

  /** 
   * 註冊中間件到指定的執行流水線 
   * @param pipeline 流水線類型: 'TOOL' (工具調用) 或 'MUTATION' (狀態變更)
   * @param middleware 中間件實例
   */
  use(pipeline: 'TOOL' | 'MUTATION', middleware: IMiddleware): void;
}
```

- [ ] **Step 2: Verify compilation**
Run: `tsc --noEmit interfaces/session/ISession.ts`
Expected: PASS

---

### Task 3: Specialized Agent Interfaces (Part 1: Base & Core)

**Files:**
- Create: `interfaces/agent/IWorkerAgent.ts`
- Modify: `interfaces/agent/IAgent.ts`

- [ ] **Step 1: Create IWorkerAgent interface**

```typescript
import { IAgent } from './IAgent';

/**
 * 基礎 Worker Agent 接口
 * 最底層執行單位，負責執行具體 Task。
 */
export interface IWorkerAgent extends IAgent {
  /** 
   * 執行指定的 Intent (行為描述) 
   * @param intent 行為描述對象
   */
  executeIntent(intent: any): Promise<any>;
}
```

- [ ] **Step 2: Remove switchRole from IAgent**

```typescript
import { IMutationRequest } from '../models/IMutationRequest';

/**
 * 基礎 Agent 接口
 * 定義了 SuperNova 體系中所有智能體的最小行為準則。
 */
export interface IAgent {
  /** Agent 唯一識別碼 */
  id: string;
  /** Agent 的角色名稱 (靜態確定) */
  role: string;

  /** 
   * 接收並處理分派的任務 
   * @param task 任務數據對象
   */
  receiveTask(task: any): Promise<void>;

  /** 
   * 向系統提議一項規則變更 (Mutation)
   * @param mutation 變更請求對象
   */
  proposeMutation(mutation: IMutationRequest): Promise<void>;
  
  /** 
   * 將 Agent 當前狀態序列化為 JSON 
   */
  toJSON(): Record<string, any>;

  /** 
   * 從 JSON 配置初始化或恢復 Agent 狀態 
   * @param config 符合 AgentDefinitionSchema 的配置對象
   */
  initFromJSON(config: Record<string, any>): Promise<void>;
}
```

- [ ] **Step 3: Verify compilation**
Run: `tsc --noEmit interfaces/agent/IWorkerAgent.ts interfaces/agent/IAgent.ts`
Expected: PASS

---

### Task 4: Specialized Agent Interfaces (Part 2: Identity Specialization)

**Files:**
- Create: `interfaces/agent/ICoderAgent.ts`
- Create: `interfaces/agent/IResearcherAgent.ts`

- [ ] **Step 1: Create ICoderAgent interface**

```typescript
import { IWorkerAgent } from './IWorkerAgent';

/**
 * 程式碼專家 Agent 接口
 */
export interface ICoderAgent extends IWorkerAgent {
  /** 
   * 編譯或檢查程式碼 
   * @param source 原始碼內容
   */
  compile(source: string): Promise<{ success: boolean; errors?: string[] }>;

  /** 
   * 進行程式碼審查 
   * @param diff 變更差異
   */
  reviewCode(diff: string): Promise<string>;
}
```

- [ ] **Step 2: Create IResearcherAgent interface**

```typescript
import { IWorkerAgent } from './IWorkerAgent';

/**
 * 研究專家 Agent 接口
 */
export interface IResearcherAgent extends IWorkerAgent {
  /** 
   * 執行搜索任務 
   * @param query 搜索關鍵字
   */
  search(query: string): Promise<any[]>;

  /** 
   * 總結資訊 
   * @param data 原始數據
   */
  summarize(data: any): Promise<string>;
}
```

- [ ] **Step 3: Verify compilation**
Run: `tsc --noEmit interfaces/agent/ICoderAgent.ts interfaces/agent/IResearcherAgent.ts`
Expected: PASS

---

### Task 5: Strengthen Tool Interface

**Files:**
- Modify: `interfaces/tool/ITool.ts`

- [ ] **Step 1: Ensure ITool strictly follows Tier 2 requirements**

```typescript
/**
 * 工具安全評級
 * TIER_1: 唯讀操作，無副作用 (Read-Only)
 * TIER_2: 有副作用的操作，但受控 (Side-Effect)
 * TIER_3: 具破壞性操作，不可逆 (Destructive)
 */
export type ToolSafetyTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

/**
 * 原子化工具接口
 * 定義了一個可被 Agent 調用的原子操作。
 */
export interface ITool<TIn = any, TOut = any> {
  /** 工具名稱 */
  name: string;
  
  /** 工具功能描述 */
  description: string;

  /** 
   * 安全評級 
   * 系統將根據此評級決定是否需要額外的審查或權限。
   */
  safety_tier: ToolSafetyTier;
  
  /** 
   * 執行工具的核心邏輯
   * @param input 工具輸入數據
   */
  run(input: TIn): Promise<TOut>;

  /** 
   * 驗證輸入參數是否合法
   * @param input 工具輸入數據
   * @returns 是否驗證通過
   */
  validateInput(input: any): Promise<boolean>;
  
  /** 執行此工具所需的最小能力標籤 */
  required_capabilities: string[];
}
```

- [ ] **Step 2: Verify compilation**
Run: `tsc --noEmit interfaces/tool/ITool.ts`
Expected: PASS

---

### Task 6: Final Audit and IOpLog Verification

**Files:**
- Modify: `interfaces/session/IOpLog.ts`

- [ ] **Step 1: Ensure IOpLog compress method is correctly typed**

```typescript
/**
 * 操作日誌接口 (OpLog)
 * 用於全鏈路因果追蹤與上下文壓縮。
 */
export interface IOpLog {
  /** 寫入一條日誌記錄 */
  append(type: string, payload: any): Promise<void>;
  /** 查詢符合條件的日誌流 */
  query(filter: Record<string, any>): Promise<any[]>;
  /** 
   * 壓縮日誌為結構化摘要 
   * @param summaryAgent 用於執行摘要的 Agent 實例 (通常為 IAgent 類型)
   * @returns 壓縮後的摘要內容
   */
  compress(summaryAgent: any): Promise<string>;
}
```

- [ ] **Step 2: Final project-wide type check (interfaces only)**
Run: `tsc --noEmit interfaces/**/*.ts`
Expected: PASS

- [ ] **Step 3: Commit all changes**
```bash
git add interfaces/
git commit -m "feat: upgrade interfaces to Tier 2 (specialization and stability enhancement)"
```
