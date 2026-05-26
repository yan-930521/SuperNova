# SuperNova: 一個關於「執行狀態與對話分離」的 AI Runtime 實驗

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Decoupled--Runtime-orange.svg)](#-核心設計-sessionmanager-vs-taskmanager)
[![Stage](https://img.shields.io/badge/Stage-Research--Prototype-yellow.svg)](#-開發進度-roadmap)

SuperNova 是一個正在開發中的 **AI Runtime (執行時)** 實驗。它的目標是探索如何讓 AI Agent 在處理複雜、長期任務時，不會因為對話內容過長而「迷失目標」。

## 💡 核心挑戰：Context 與目標的漂移 (Goal Drift)

在開發 Agent 時，我發現了一個常見問題：當我們讓 Agent 執行複雜任務時，思考過程、工具輸出、與原始對話全都混在同一個 Context 裡。這會導致：
1.  **Token 浪費**：為了讓 Agent 記得目標，必須重複輸入大量重複的背景資訊。
2.  **目標漂移 (Goal Drift)**：Agent 容易被中間繁雜的執行細節干擾，忘記最初要解決的問題。

## 🏗️ 核心設計：SessionManager 與 TaskManager 的雙層分離

SuperNova 並非傳統的「聊天機器人」，它試圖透過雙層管理機制來分離「溝通狀態」與「執行狀態」：

### 1. 會話層 (SessionManager - Communication State)
*   **職責**：維護與用戶的溝通連貫性，記錄人機對話與任務的高階摘要。
*   **目的**：讓 MainAgent 始終專注於與用戶的溝通，不被底層技術報錯或複雜的執行日誌干擾。

### 2. 執行層 (TaskManager - Execution State)
*   **職責**：負責任務的動態規劃、並行調度、以及任務圖 (TaskGraph) 的維護。
*   **目的**：確保任務執行的可靠性，記錄所有詳細的工具呼叫數據，支持異步的背景操作。

---

## 🤖 代理架構：遞歸編排與協作 (Agentic Core)

SuperNova 的代理系統採用了具備高度靈活性的編排模型：

-   **主代理 (MainAgent) 的多重角色**：
    -   **任務調度**：MainAgent 可以直接調用工具來提交目標給 `TaskManager`，觸發自動規劃流。
    -   **子任務指派**：MainAgent 具備建立子任務與指派子代理 (WorkerAgent) 的能力。
    -   **同行協作 (Recursive Orchestration)**：MainAgent 可以指派任務給另一個 MainAgent。例如：一個「研究型 MainAgent」可以將程式實作部分的子目標，指派給一個「開發型 MainAgent」，實現複雜多段任務的深度協作。
-   **統一執行介面**：所有代理不論角色類型，均繼承自相同的基類並內建 ReAct 思考循環，確保了全系統行為的一致性。

---

## 🔄 執行流程 (Execution Flow)

1.  **提交目標 (Goal Submission)**：用戶輸入目標，由 `SessionManager` 建立會話並記錄初始狀態。
2.  **初始化規劃 (Planning)**：`TaskPlanner` 介入，透過 LLM 將目標拆解為里程碑。
3.  **任務動態展開 (JIT Expansion)**：根據當前里程碑，動態展開具體的任務節點並寫入任務圖。
4.  **代理指派 (Provisioning)**：`TaskManager` 根據任務需求，從 `AgentManager` 中找出適合的角色執行。
5.  **執行與記錄**：Worker 執行工具，將詳細結果存入任務狀態，並發布完成事件。
6.  **摘要回報**：系統監聽到任務完成，將該步驟的「摘要」同步回會話歷史。
7.  **反饋與迭代**：Planner 根據上一步的結果，決定下一個任務的展開方式。

---

## 🛠️ 目前已實現的能力 (Runtime Capabilities)

-   **遞歸規劃工作流**：基於 LangGraph 實現了「規劃-評審-展開」的自我迭代流程。
-   **異步事件總線 (Event Bus)**：全系統透過事件進行解耦通訊。
-   **對稱式持久化系統**：User, Session, Task, Agent 模組均具備統一的儲存庫介面。
-   **全鏈路追蹤協議**：確保每一項操作都能溯源至特定的 SessionID 與 TraceID。

---

## 📅 開發進度 (Roadmap)

### 🏁 已完成 (Phase 1 & 2)
- [x] 基礎數據協議與對稱式 Manager-Repository 架構。
- [x] 具備 Zod 校驗的結構化推理引擎 (`InferenceEngine`)。
- [x] 核心編排工具集 (Dispatcher, Create, Assign)。

### 🏗️ 進行中 (Phase 3: Runtime 強化)
- [ ] **JIT 規劃優化**：強化基於執行反饋的即時路徑修正。
- [ ] **脈搏引擎 (Pulse Engine)**：實作定時監控與數據變動監聽。
- [ ] **上下文壓縮**：自動化對話摘要以應對超長會話。

### 📅 未來計畫
- [ ] 數據庫遷移 (PostgreSQL / MongoDB / Redis)。
- [ ] 生產級容器化 (Docker)。
- [ ] Web UI 觀測面板。

---
© 2026 SuperNova Project. 一個專注於系統架構與 AI 協作邏輯的開發實驗。
