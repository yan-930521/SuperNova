# SuperNova 2.0: 大一統記憶與上下文管理架構 (Unified Memory & Context Architecture)

本文件定義了 SuperNova 的核心記憶架構，旨在解決長期、複雜任務中的 **Context Explosion (上下文爆炸)** 與 **Goal Drift (目標偏移)** 問題。本架構採「動靜分離」與「按需加載」的核心策略。

---

## 1. 核心哲學：一會話，多任務 (One Session, Many Missions)

- **Session (會話)**：長期的「辦公室」或「專案頻道」。它是記憶的邊界，共享持久化的事實 (Facts) 與經驗 (SOPs)。
- **Chain (任務鏈)**：具體的「任務大包」或「Sprint」。它是工作記憶 (Working Memory) 的邊界，完成後銷毀。
- **Task (任務節點)**：單一執行的「Ticket」。它繼承 Chain 的上下文，並產出微觀軌跡。

---

## 2. 記憶四大中心架構 (The Four Centers)

### A. 資訊緩衝中心 (The Buffer - Working Memory)
- **定位**：Chain 執行期間的「即時白板」。
- **職責**：
    - **動態錨點 (The Anchor)**：置頂 Mission Goal 與當前阻塞點 (Obstacles)。
    - **即時狀態 (Variables)**：存儲跨任務共享的輕量參數（如：`db_port`, `temp_token`）。
    - **長文本緩衝 (Buffers)**：存儲中間生成的長篇代碼或文檔。
- **Prompt 策略**：變數全量注入；長文本僅注入摘要與 ID，由 Agent 主動拉取。

### B. 上下文加工中心 (The Processor - Context Management)
- **定位**：負責對話歷史的「消化與過濾」。
- **職責**：
    - **上下文摺疊 (Context Folding)**：將舊的對話輪數壓縮為單行摘要（例如：`[Agent] (10 turns summary): 嘗試配置環境但遭遇權限問題`）。
    - **權重路由**：決定哪些歷史片段對當前任務具備高相關性。

### C. 持久化知識中心 (The Repository - Persistent Memory)
- **定位**：跨 Chain 存在的「專案百科全書」。
- **層級**：
    - **事實庫 (L2 Facts)**：經驗證的靜態事實，採 Namespace (如 `/config`, `/env`) 管理。
    - **技能庫 (L3 SOPs)**：成功修復問題的工作流與避坑指南。
    - **封存層 (L4 Archives)**：詳細的執行軌跡，僅用於深層回溯。
- **Prompt 策略**：**按需加載 (Pull-based)**。僅在 Prompt 注入標籤索引 (L1 Index)，不包含具體內容。

### D. 記憶更新循環 (The Consolidation Loop)
- **定位**：負責記憶「提煉與沈澱」的背景流程。
- **職責**：
    - **驗證機制**：區分「已驗證 (Verified)」、「提案 (Proposed)」與「失敗 (Failed)」的記憶權威等級。
    - **心智重組 (Distillation)**：任務結案時，將 Working Memory 中的精華自動整理進 Persistent Memory。

---

## 3. 記憶操縱協議 (Interaction Protocol)

### 核心規則
1. **Identify (索引導航)**：Agent 啟動時先掃描 L1 標籤，確定所需知識的位置。
2. **Pull (主動拉取)**：對於任何非置頂資訊，Agent 必須透過工具主動 `read` 或 `search`。
3. **Patch (手術式更新)**：更新持久事實時，優先採用「局部修補」而非「整檔覆寫」。

### 記憶權威等級 (Authority Levels)
- **Verified**：經由工具執行成功、具備確鑿證據的資訊。
- **Proposed**：Agent 的推測或待執行的計畫。
- **Failed**：導致執行失敗的教訓，用於指導 Retry/Re-plan 避開死胡同。

---

---

# Unified Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a tiered, "Load on Demand" memory system comprising Working Memory (Chain-scoped) and Persistent Memory (Session-scoped).

**Architecture:** Unified MemoryManager and Repository handling L1-L4 layers with context folding and dependency injection.

**Tech Stack:** Bun, TypeScript, FileSystem, EventBus.

---

### Task 1: Data Protocols & Basic Repository (Done)

**Files:**
- Create: `src/infra/types/memory.ts`
- Create: `src/infra/storage/FileSystemMemoryRepository.ts`

- [x] **Step 1: Define Memory DTOs and Interfaces**
- [x] **Step 2: Implement FileSystemMemoryRepository**
- [x] **Step 3: Commit changes**

---

### Task 2: MemoryManager & Lifecycle Management (Done)

**Files:**
- Create: `src/manager/MemoryManager.ts`
- Modify: `src/runtime/GlobalRuntime.ts`

- [x] **Step 1: Implement MemoryManager class**
- [x] **Step 2: Inject MemoryManager into GlobalRuntime**
- [x] **Step 3: Commit changes**

---

### Task 3: Working Memory Integration (In-Flight)

**Files:**
- Modify: `src/manager/TaskManager.ts`
- Modify: `src/agent/BaseAgent.ts`

- [ ] **Step 1: Update TaskManager to initialize Working Memory on Chain start**
- [ ] **Step 2: Update BaseAgent.buildPrompt to inject L1 Index and Working Variables**
- [ ] **Step 3: Commit changes**

---

### Task 4: Memory Tools (The Pull Mechanism)

**Files:**
- Create: `src/tool/core/MemoryTool.ts`

- [ ] **Step 1: Implement UnifiedMemoryTool**
  - `memory_read(namespace, key)`
  - `memory_save(namespace, key, content)`
  - `working_set(key, value)`
- [ ] **Step 2: Register tool in ToolRegistry**
- [ ] **Step 3: Commit changes**

---

### Task 5: Mental Consolidation Loop

**Files:**
- Modify: `src/manager/MemoryManager.ts`
- Modify: `src/manager/TaskManager.ts`

- [ ] **Step 1: Implement `distillExperience` method in MemoryManager**
- [ ] **Step 2: Trigger consolidation in TaskManager when Chain completes**
- [ ] **Step 3: Final verification with a multi-task scenario**

