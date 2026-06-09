# SuperNova 快速入門指引 (Quick Start for Core Developers)

本文件旨在幫助核心開發者快速理解 SuperNova 的類別架構與組件職責。SuperNova 是一個基於事件驅動與 PDCA 循環的代理蜂群系統，旨在解決長時任務中的目標偏移問題。

---

## 1. 系統核心與生命週期 (Core & Runtime)
負責組件的裝配、生命週期管理與通訊機制。

- **`GlobalRuntime` (`src/runtime/GlobalRuntime.ts`)**
  - **職責**：系統組合根 (Composition Root)，全局單例。負責初始化 DI 容器、載入配置、註冊所有基礎設施與服務。
- **`ComponentContainer` (`src/core/container/ComponentContainer.ts`)**
  - **職責**：依賴注入 (DI) 容器。管理所有組件的生命週期，依序執行 `boot` 與 `shutdown`。
- **`EventBus` (`src/core/messaging/MessageBus.ts`)**
  - **職責**：非同步事件與指令總線。實現系統各層級間的解耦通訊，驅動 Agent 間的協作。

---

## 2. 代理蜂群角色 (Agentic PDCA Hive)
繼承自 `BaseAgent`，基於五大專業角色實現 PDCA 自律循環。

- **`SupervisorAgent`**：核心推理編排器，負責決定任務模板、進行任務路由 (Routing) 與異常換檔 (Escalation)。
- **`PlanningAgent` (P)**：規劃專家，負責將用戶目標拆解為可執行的任務圖譜 (Task Graph)。
- **`DoingAgent` (D)**：執行專家，採用 ReAct 循環 (Thought-Action-Observation) 並實際調用工具執行任務。
- **`CheckingAgent` (C)**：質量門禁，對 `DoingAgent` 的產出進行驗證，確保符合驗證標準。
- **`ActingAgent` (A)**：改進專家，負責將成功的經驗提煉為 SOP (L3) 或將碎片知識沉澱為事實 (L2)。

---

## 3. 業務應用服務 (Application Services)
封裝核心業務邏輯，協調領域實體與基礎設施。

- **`TaskService` & `TaskScheduler`**：共同管理任務的狀態遷徙，驅動 PDCA 事件流轉。
- **`MemoryService`**：管理三層記憶矩陣：
    - **L1 (Blackboard)**：短期會話黑板，用於傳遞即時變數與上下文。
    - **L2 (Fact)**：長期事實庫，存儲已驗證的跨會話知識。
    - **L3 (SOP)**：標準作業程序庫，指導 Agent 如何執行特定類型的任務。
- **`ContextService`**：將記憶層數據與當前任務狀態「投影」為 Agent 的動態 Prompt。
- **`SessionService`**：管理用戶會話的生命週期與上下文隔離。

---

## 4. 基礎設施與工具 (Infrastructure & Tools)
提供系統支撐能力。

- **`InferenceEngine` (`src/infra/ModelRegistry.ts`)**：LLM 推理抽象層，支援結構化輸出解析 (Structured Output)。
- **`PulseEngine` (`src/infra/PulseEngine.ts`)**：系統脈搏，監控任務超時、觸發自癒鉤子 (Self-healing Hooks)。
- **`FileSystemRepository`**：一系列負責將領域模型持久化到本地檔案系統的儲存庫。
- **`ToolRegistry`**：工具目錄，動態管理 Agent 可用的工具集（如文件操作、網絡搜索等）。

---

## 5. 領域模型 (Domain Entities)
定義系統的核心實體與業務規則。

- **`Task` & `TaskGraph`**：定義任務單元及其依賴關係。
- **`BaseMemory` (L1/L2/L3)**：定義三層記憶體的數據結構。
- **`BaseSession` & `UserSession`**：定義會話狀態。
- **`User`**：定義使用者實體。

---

## 🚀 快速開始開發

### 環境準備
1. 安裝 [Bun](https://bun.sh/) 運行時。
2. 複製 `.env.example` 為 `.env` 並配置 `OPENAI_API_KEY`。
3. 執行 `bun install` 安裝依賴。

### 運行 Demo
- **對話模式**：`bun run scripts/chat-demo.ts`
- **任務執行模式**：`bun run scripts/task-demo.ts`

---

## ⚠️ 開發守則
在開始編寫代碼前，請務必閱讀專案根目錄下的 **`GEMINI.md`**。它定義了專案的「認知先行」流程、代碼規範與協作原則。

> **提示**：本專案嚴格區分「通訊狀態 (Session)」與「執行狀態 (Task)」，修改核心邏輯時請確保兩者的解耦。
