# SuperNova: A Persistent Multi-Agent Runtime for Autonomous Coordination

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#-核心設計-事件驅動與-pdca-閉環)
[![Stage](https://img.shields.io/badge/Stage-v0.4.0-yellow.svg)](#-開發進度-roadmap)

SuperNova 是一個專為長期任務設計的 **AI Runtime (執行時)**。它運行於 **Bun** 高性能環境，旨在探索如何讓 AI Agent 在處理複雜、跨領域且具備長期目標的任務時，透過架構上的解耦與事件驅動來解決 **Context Drift (上下文漂移)** 與 **Goal Drift (目標偏移)** 問題。

## ⚡ 為什麼選擇 Bun？ (Why Bun?)

為了支撐 AI Agent 的高頻、長時運行需求，我們選擇 Bun 作為核心 Runtime：

1.  **極致性能**：Bun 的啟動速度與執行效率遠超傳統 Node.js，這對於需要頻繁啟動 Agent 思考循環的系統至關重要。
2.  **全能工具鏈**：內建原生 TypeScript 支持與高效的 `bun test` 運行器，大幅簡化了開發鏈路，不再需要繁瑣的 `tsc` 或 `jest` 配置。
3.  **現代化開發體驗**：原生支持 `.env`、快速的依賴管理 (`bun install`) 以及更簡潔的異步處理機制，使 SuperNova 保持輕量且易於擴展。

## 💡 核心挑戰：Communication vs. Execution

在傳統 Agent 框架中，對話紀錄 (Context) 同時承載了「人機溝通」與「工具執行細節」，這會導致：
1.  **Token 污染**：底層工具的冗長輸出會迅速耗盡 Context 窗口，淹沒原始目標。
2.  **邏輯混亂**：Agent 容易被執行過程中的技術報錯干擾，導致高層次的決策發生偏移。

**SuperNova v0.4.0 透過「代理生命週期與上下文隔離」，將認知與執行完全解耦。**

---

## 🏗️ 核心設計：事件驅動與 PDCA 閉環

SuperNova 的 Runtime 核心不再依賴於單一的狀態機或巨型 Prompt，而是轉向完全的**事件驅動架構 (Event-Driven Architecture)**：

### 1. 代理生命週期與無狀態單例 (Stateless Singletons)
所有的專業 Agent (`SupervisorAgent`, `PlanningAgent`, `DoingAgent`, `CheckingAgent`, `ActingAgent`) 都是運行在 GlobalRuntime 中的單一實例。它們身上**不綁定任何使用者的狀態或對話歷史**，使得同一個 Agent 能夠並行處理來自不同任務的事件。

### 2. 獨立的會話歷史 (Independent Session History)
每個 Task 擁有獨立的對話歷史 (`history` 陣列)，且這份歷史**不會**跨越 PDCA 階段共享。不同階段的 Agent 之間不看對方的內部思考過程（例如 CheckingAgent 不看 DoingAgent 的 ReAct 過程），只透過 L1 Blackboard 與事件交接訊息溝通，徹底解決 Token 暴增與注意力分散的問題。

### 3. 三層記憶體架構 (Memory Matrix)
系統採用分層記憶體以平衡效能與長效知識儲存：
- **L1 Blackboard (黑板)**：存放即時變數與跨 Agent 交接的指針。
- **L2 Fact (事實)**：存放由 `ActingAgent` 提煉出的、已驗證的長期事實。
- **L3 SOP (操作手冊)**：存放標準化作業程序，賦予系統演化能力。

---

## 🤖 PDCA 代理角色分工

SuperNova 透過標準化的事件協議，讓不同的專業代理協同完成任務：

- **Supervisor (中樞)**：負責任務路由，決定任務的 PDCA 複雜度模板 (如 Standard 還是 Complex)，並處理 `CheckingAgent` 呈報的換檔 (Escalate) 與自癒邏輯。
- **Planning (規劃)**：將高階目標進行分形拆解 (Fractal Decomposition)，產出任務圖譜 (subGraph)。
- **Doing (執行)**：負責實際的工具調用，內建 ReAct 推理循環，並將觀察結果實時同步至 L1 黑板。
- **Checking (審核)**：作為質量門禁。依據模板複雜度（例如 Complex 模板的依賴性溯源 Hard Gate 與反方辯證 Soft Gate）進行嚴格把關。
- **Acting (改善)**：負責經驗標準化與知識沈澱，將 L1 軌跡轉化為 L2 事實與 L3 SOP。

---

## 🗺️ 系統架構全景圖 (Runtime System Map)

*(圖表更新中 - 請參閱 docs/ARCH.md 以獲取最新的 Mermaid 序列圖與互動流程)*

---

## 📅 開發進度 (Roadmap)

### 🏁 已完成 (Phase 1 & 2)
- [x] 基礎數據協議與對稱式持久化系統。
- [x] 具備 Zod 校驗的結構化推理引擎 (`InferenceEngine`)。
- [x] 核心編排工具集 (Dispatcher, Create, Assign)。

### 🏗️ 已完成：v0.4.0 架構重構
- [x] **Agent 引擎初始化重構**：移除屎山代碼，統一引擎配置。
- [x] **事件驅動架構**：以 EventBus 與 TaskScheduler 為核心的任務流轉。
- [x] **PDCA 專業分工實作**：SA, PA, DA, CA, AA 角色邏輯與 Prompt 切分。
- [x] **複雜模板的進階 QA**：實作 Source Tracing 與 Red Teaming 門檻。

### 🚀 進行中 (Phase 3: 內部邏輯深化)
- [ ] **ContextService 動態展開**：實作 L1 核心產出的自動 Prompt 注入邏輯。
- [ ] **TaskScheduler 並行調度**：實作基於任務圖入度的異步啟動機制 (onTick)。
- [ ] **PulseEngine 自癒升級**：實作超時偵測與自動換檔。

### 📅 未來計畫
- [ ] **TailAgent (./web)**：基於 React + Tailwind 的視覺化控制面板。
- [ ] 數據庫遷移 (PostgreSQL / MongoDB / Redis)。
- [ ] 生產級容器化 (Docker)。

---
© 2026 SuperNova Project. 一個專注於系統架構與 AI 協作邏輯的開發實驗。
