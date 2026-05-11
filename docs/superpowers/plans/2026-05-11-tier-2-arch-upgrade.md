# SuperNova Tier 2 Architecture Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SuperNova TypeScript interfaces to support advanced architectural features including session snapshotting, middleware pipelines, dynamic agent roles, tool safety tiering, and OpLog compression.

**Architecture:** Enhancing the core interfaces to support strong consistency (Snapshot/Rollback), extensibility (Middleware), and safety (Tool Tiers).

**Tech Stack:** TypeScript

---

### Task 1: Create IMiddleware Interface

**Files:**
- Create: `interfaces/session/IMiddleware.ts`

- [ ] **Step 1: Create the file with IMiddleware definition**

```typescript
/**
 * 中間件接口
 * 用於在 Session 執行流水線中插入自定義邏輯。
 */
export interface IMiddleware {
  /**
   * 處理函數
   * @param context 執行上下文
   * @param next 調用流水線中的下一個中間件
   */
  handle(context: any, next: () => Promise<void>): Promise<void>;
}
```

- [ ] **Step 2: Verify file creation**
Check if `interfaces/session/IMiddleware.ts` exists.

---

### Task 2: Upgrade ISession and SessionSchema

**Files:**
- Modify: `interfaces/session/ISession.ts`
- Modify: `interfaces/session/SessionSchema.ts`

- [ ] **Step 1: Update ISession.ts**
Add `snapshot`, `rollback`, and `registerMiddleware`.

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
   * @param pipeline 流水線名稱 (例如: 'pre-execution', 'post-execution')
   * @param middleware 中間件實例
   */
  registerMiddleware(pipeline: string, middleware: IMiddleware): void;
}
```

- [ ] **Step 2: Update SessionSchema.ts**
(The requirement mentions SessionSchema.ts but didn't specify what to add there. Usually, if methods are added to the interface, the schema might need to reflect potential persistence of these things, but snapshots are usually runtime. However, I'll check if any definition needs update. The prompt says "增加 snapshot() 與 rollback(...) 方法" in the context of ISession.ts & SessionSchema.ts. I'll add documentation or metadata if relevant, but the interface is the primary place for methods.)
Actually, I'll just ensure `SessionSchema.ts` is consistent if needed.

---

### Task 3: Upgrade IAgent Interface

**Files:**
- Modify: `interfaces/agent/IAgent.ts`

- [ ] **Step 1: Add switchRole to IAgent**

```typescript
  /** 
   * 切換 Agent 的角色與指令集 (特種兵模式)
   * @param roleId 目標角色 ID
   * @param instruction 針對該角色的特定指令或系統提示
   */
  switchRole(roleId: string, instruction: string): Promise<void>;
```

---

### Task 4: Upgrade ITool Interface

**Files:**
- Modify: `interfaces/tool/ITool.ts`

- [ ] **Step 1: Add validateInput and safety_tier to ITool**

```typescript
/**
 * 工具安全評級
 * TIER_1: 只讀操作，無副作用
 * TIER_2: 有副作用的操作，但可逆或受控
 * TIER_3: 破壞性操作，不可逆或高風險
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

  /** 安全評級 */
  safety_tier: ToolSafetyTier;
  
  /** 
   * 執行工具的核心邏輯
   * 建議在 Guardian 防護下執行，以提供隔離與穩定性。
   * @param input 工具輸入數據
   */
  run(input: TIn): Promise<TOut>;

  /** 
   * 驗證輸入參數是否合法
   * @param input 工具輸入數據
   */
  validateInput(input: any): Promise<boolean>;
  
  /** 執行此工具所需的最小能力標籤 */
  required_capabilities: string[];
}
```

---

### Task 5: Upgrade IOpLog Interface

**Files:**
- Modify: `interfaces/session/IOpLog.ts`

- [ ] **Step 1: Add compress to IOpLog**

```typescript
  /** 
   * 壓縮日誌為結構化摘要 
   * @param summaryAgent 用於執行摘要的 Agent 實例 (例如 RootAgent 或特定摘要 Agent)
   * @returns 壓縮後的摘要內容
   */
  compress(summaryAgent: any): Promise<string>;
```

---

### Task 6: Final Verification

- [ ] **Step 1: Verify all files compile (conceptually or via tsc if available)**
Check imports and syntax.
