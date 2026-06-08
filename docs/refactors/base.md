# 基礎設施鞏固 (Base Infrastructure Consolidation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [X]`) syntax for tracking.

**Goal:** 加固核心通訊、記憶體與任務領域模型，支援狀態機驅動的 PDCA 協作流。

**Architecture:** 
1. **Core Messaging**: 擴展事件總線，導入 `spanId` 與 `templateType` 追蹤。
2. **Task Domain**: 整合 `TaskFlow` (狀態機) 與 `subGraph` (分形架構) 進入 Task 實體與 DTO。
3. **Shared Memory**: 補全 L1 黑板的共享寫入邏輯與強型別數據結構。
4. **Infra Enhancement**: 升級 `PulseEngine` 與 `LogManager` 以支援新架構的監控與追蹤。

**Tech Stack:** TypeScript

---

### Task 1: 事件總線與追蹤體系強型別化

**Files:**
- Modify: `src/core/messaging/IBus.ts`
- Modify: `src/infra/types/agent.ts`

- [X] **Step 1: 擴展 AgentEvents 以支援 7 種任務模板**

在 `src/core/messaging/IBus.ts` 中，更新 `AgentEvents` 命名空間。

- [X] **Step 2: 升級 IAgentEventPayload 追蹤欄位**

確保 `IAgentEventPayload` 包含 `spanId`, `parentSpanId`, `templateType` 與 `currentPhase`。

### Task 2: Task 領域實體與 DTO 重構

**Files:**
- Create: `src/domain/task/template/TaskFlow.ts`
- Modify: `src/infra/types/task.ts`
- Modify: `src/domain/task/Task.ts`

- [X] **Step 1: 定義 TaskFlow 領域介面與 DTO**

在 `src/infra/types/task.ts` 中新增 `TaskFlowDTO` 定義。

- [X] **Step 2: 更新 TaskDTO 以包含 Flow 與 SubGraph**

在 `src/infra/types/task.ts` 的 `TaskDTO` 中新增欄位以支援分形架構。

- [X] **Step 3: 實作 TaskFlow 領域物件並整合進 Task**

在 `src/domain/task/Task.ts` 中整合 `flow` 屬性與基礎遷徙邏輯。

### Task 3: 補全 L1 黑板 (Shared Memory) 與 MemoryService

**Files:**
- Modify: `src/infra/types/memory.ts`
- Modify: `src/application/memory/MemoryService.ts`

- [X] **Step 1: 定義強型別 L1 數據結構與指針**

更新 `src/infra/types/memory.ts`。

- [X] **Step 2: 重構 MemoryService 寫入權限**

在 `src/application/memory/MemoryService.ts` 中實作支援全角色寫入的 `postToL1` 方法。

### Task 4: 脈搏引擎與日誌系統升級

**Files:**
- Modify: `src/infra/PulseEngine.ts`
- Modify: `src/infra/LogManager.ts`

- [X] **Step 1: LogManager 支援 Span 追蹤打印**

- [X] **Step 2: PulseEngine 監控 TaskFlow 狀態並支持超時換檔訊號**

---

### Task 5: 驗證與提交

- [X] **Step 1: 執行類型檢查**
Run: `bun x tsc --noEmit`

- [X] **Step 2: 提交地基重構代碼**
```bash
git add . ; git commit -m "refactor: consolidate infrastructure groundwork (messaging, memory, task domain)"
```
