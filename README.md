# SuperNova: A Reliable AI Agent Orchestration Framework

SuperNova 是一個基於 TypeScript 構建的高性能、模組化且具備高度可觀測性的 AI Agent 執行時框架。設計核心旨在提供一個結構化、可靠且易於擴展的任務編排底座。

---

## 🚀 核心特性 (Key Features)

### 1. 工業級穩定性 (Stability & Guardian)
*   **Guardian 守護機制：** 所有的 Tool 調用與異步任務均受到 `IGuardian` 監控，支持強制的超時控制 (Timeout Control) 與異常隔離 (Exception Isolation)。
*   **嚴格回退恢復 (Rollback)：** 基於快照 (Snapshot) 的狀態管理，當發生不可修復的邏輯錯誤時，系統可自動回退到上一個穩定的任務節點。

### 2. 高效的並行調度 (Concurrency & Scheduling)
*   **基於 DAG 的排程引擎：** 自動分析任務間的依賴關係，構建有向無環圖 (TaskGraph)。
*   **最大化併發：** 使用 `ReadyQueue` 與 `ParallelScheduler` 實時調度入度 (In-degree) 為 0 的任務，充分榨乾多核 CPU 性能。

### 3. 全鏈路可觀測性 (Observability)
*   **Session-Scoped OpLog：** 以會話為邊界記錄完整的因果鏈，從 Goal 到 Task 再到 Tool 的執行細節一覽無遺。
*   **TraceContext 傳播：** 強制要求所有跨組件通訊攜帶 `session_id` 與 `trace_id`。

### 4. 模組化與擴展性 (Modularity)
*   **無狀態推理引擎 (Stateless Inference)：** 重構後的 `InferenceEngine` 採用無副作用設計，與 Agent 狀態解耦，提升了系統的純粹性與並行能力。
*   **提示詞模板快取 (Prompt Template Caching)：** 支持 `ChatPromptTemplate` 預編譯與綁定，避免重複讀取磁碟，顯著降低推理延遲。

### 5. 結構化輸出與安全性 (Structured Output & Safety)
*   **OpenAI Strict Mode 支持：** 全面優化 JSON Schema，確保在 OpenAI 強制模式下具備 100% 的生成可靠性。
*   **中間件流水線 (Middleware Pipeline)：** 核心行為（如工具執行、Mutation 提交）支持 Pre/Post/Error 三層攔截器。

---

## 🏗️ 核心架構：組件化執行模型 (Component-Based Architecture)

SuperNova 採用 **組件化容器 (Component Container)** 設計。Agent 本身是一個輕量級容器，透過 JSON 配置動態裝載具備特定能力的行為組件 (Behaviors)，實現了「大腦 (思維/規劃) 與身體 (執行) 分離」。

- **Identity (身份):** 由 JSON 定義的靜態特徵。
- **Behavior Layer (組件層):** 基於 LangGraph 實作的可插拔行為插件 (Planner, Reasoner, Evaluator)。
- **Execution Layer (執行層):** 透過標準化 Intent 與 Data-Only Output 與世界交互。

---

## 🛠️ 技術棧 (Tech Stack)

- **語言：** TypeScript 5.x
- **LLM 框架：** LangChain / LangGraph (JS/TS)
- **數據驗證：** Zod (Strict Schema)
- **環境：** Node.js
- **測試：** Jest + ts-jest

---

## 🚦 快速開始 (Quick Start)

### 1. 安裝依賴
```bash
npm install
```

### 2. 配置環境
在根目錄建立 `.env` 文件，填入：
```env
OPENAI_API_KEY=your_key_here
```

### 3. 運行 Demo
體驗真實的自動化規劃與執行流程：
```bash
npx ts-node scripts/run-demo.ts
```

### 4. 運行測試
```bash
npm test tests/
```

---

## 📜 開發規範 (Development Standards)

本項目遵循嚴格的工程化標準：
- **註解 (Comments)：** 必須使用中文進行詳細說明，解釋邏輯意圖與風險。
- **日誌與鍵值 (Logging & Keys)：** 所有的 Log 訊息、數據結構 Key、指標名稱必須使用英文。
- **LLM 使用：** 所有真實 LLM API 呼叫必須經過 `IInferenceEngine` 並遵循安全規範。

---

## 📅 開發進度 (Roadmap)

- [x] **Phase 1-6:** 核心運行時與基礎架構落地
- [x] **Phase 7:** Agent 組件化重構 (Component-Based Refactor)
- [x] **Phase 8:** 無狀態推理引擎與提示詞綁定優化
- [ ] **Phase 9:** 真實工具鏈集成 (File, Search, Python)
- [ ] **Phase 10:** 多 Agent 協作場景實戰測試 (Ongoing)

---