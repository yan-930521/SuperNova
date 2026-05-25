# Phase 1.5：核心架構對稱化實施計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 User, Session, Task, Agent 四大模塊的 DTO 定義與文件系統持久化層，並與舊有業務邏輯精確對齊。

**Architecture:** 
- **DTO 層**: 純數據接口，對齊 `src/task/types.ts` 與 `src/models/AgentState.ts`。
- **Repository 層**: 負責 DTO 的文件系統 IO。
- **Manager 層**: 負責業務實體 (Entity) 的生命週期與 Repository 調度。

---

### Task 1: 完善與對齊 DTO 定義

**Files:**
- Create/Modify: `src/infra/types/identity.ts` (UserDTO)
- Create/Modify: `src/infra/types/storage.ts` (SessionDTO)
- Create: `src/infra/types/task.ts` (TaskDTO)
- Create: `src/infra/types/agent.ts` (AgentDTO)

- [ ] **Step 1: 定義 UserDTO**
```typescript
export interface UserDTO {
  id: string;
  name: string;
  preferences: Record<string, any>;
  apiKeys: Record<string, string>;
}
```

- [ ] **Step 2: 定義 SessionDTO (對齊 Session.ts)**
```typescript
export interface SessionDTO {
  id: string;
  userId: string;
  responsibleAgentId: string;
  goal: string;
  status: string; // IDLE | RUNNING | COMPLETED | INTERRUPTED | CRASHED
  history: any[]; // 存儲序列化後的 LangChain 訊息
  metadata: Record<string, any>;
}
```

- [ ] **Step 3: 定義 TaskDTO (對齊 TaskNode)**
```typescript
export interface TaskDTO {
  id: string;
  sessionId: string;
  type: string;
  goal: string;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  dependencies: string[];
  assignedAgentId?: string | null;
  requiredCapabilities?: string[];
  toolRouting?: {
    preferredTools?: string[];
    forbiddenTools?: string[];
  };
  options?: {
    timeout?: number;
    maxRetries?: number;
    isCritical?: boolean;
  };
  result?: any;
  metadata?: Record<string, any>;
}
```

- [ ] **Step 4: 定義 AgentDTO (對齊舊有 JSON 配置)**
```typescript
export interface AgentDTO {
  id: string;
  role: string;
  identity: string;
  capabilities: string[];
  modelPreset: 'fast' | 'smart' | 'eval';
  config: Record<string, any>;
}
```

---

### Task 2: 實作對稱的 FileSystem Repository

**Files:**
- Create: `src/infra/storage/FileSystemTaskRepository.ts`
- Create: `src/infra/storage/FileSystemAgentRepository.ts`
- Test: `tests/infra/FileSystemTaskRepository.test.ts`
- Test: `tests/infra/FileSystemAgentRepository.test.ts`

- [ ] **Step 1: 實作 TaskRepository**
  - 支持 `save(task)`
  - 支持 `findBySession(sessionId)`：讀取該 session 目錄下的所有任務檔案。
- [ ] **Step 2: 實作 AgentRepository**
  - 支持從 `agents/` 目錄加載所有 `.json` 檔案。

---

### Task 3: 重構 Manager 與 GlobalRegistry

**Files:**
- Modify: `src/infra/GlobalRegistry.ts`
- Modify: `src/infra/SessionManager.ts`
- Modify: `src/infra/AgentRegistry.ts` -> `src/infra/AgentManager.ts`

- [ ] **Step 1: 更新 GlobalRegistry 加入 Task 與 Agent Repo**
- [ ] **Step 2: 重構 SessionManager**
  - 內部使用 `GlobalRegistry.sessionRepo`。
  - 實作「加載時恢復實體」邏輯。
- [ ] **Step 3: 重構 AgentRegistry 為 AgentManager**
  - 使用 `IAgentRepository` 加載配置。

---

### Task 4: 整合測試

- [ ] **Step 1: 撰寫集成測試**
  - 驗證從創建 User 到啟動 Session 並保存 Task 的完整鏈路持久化。
