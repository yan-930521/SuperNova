# SuperNova 專案開發藍圖 (Roadmap)

本文件概述了 SuperNova（基於 TS/Bun 的 Agent Runtime）近期的核心里程碑與未來發展願景。

## v0.1.0 - Minimum Viable Product (MVP)

當前首要目標為建立具備上下文感知能力的圖向量混合記憶基礎設施。

### Phase 1: 向量嵌入 (Vector Embeddings)
- [ ] **擴充 LLMProvider**：新增 `generateEmbeddings` 方法，為系統提供通用的向量化能力。
- [ ] **記憶向量化**：將記憶系統中萃取出的 `GraphNode`（圖譜節點）內容轉換為向量，並妥善儲存以便於後續快速檢索。

### Phase 2: 動態上下文檢索 (Dynamic Context Retrieval)
- [ ] **實作生命週期 Hook**：在 `BaseAgent` 核心中實作 `BeforeAgentStep` 攔截點。
- [ ] **相似度檢索**：利用餘弦相似度 (Cosine Similarity) 計算，找出與當前情境最相關的圖譜記憶 (Graph Tuples)。
- [ ] **上下文注入**：將檢索到的高關聯記憶動態注入至 Agent 的 System Prompt 中，以增強代理人的記憶感知與決策能力。

---

## v0.2.0 - 虛擬具身智能與自主進化 (Virtual Embodied AI & Autonomous Evolution)

在確保 v0.1.0 的基礎設施穩定後，我們將朝向「基於編碼的自主進化」與「精細操作」方向邁進：

- **虛擬具身智能 (Virtual Embodied AI)**
  - 專注於虛擬環境中的精細操作與感知，達成基於編碼 (Code-based) 的自我修正與自主進化能力。
- **全新 CodeSkill 系統 (Agent-Evolvable Code)**
  - 有別於市面上的傳統 Prompt Skill，CodeSkill 本質上是一段**真實的程式碼**，並且設計成允許 Agent 在執行過程中對其進行**自我優化、重構甚至無中生有新增**，完美契合「基於編碼的自主進化」。
  - 基礎嚴格分為 `Obversal` (觀察)、`Action` (行動) 等多種類別，確保 Agent 撰寫出的每一種 Skill 其權限與職責受到嚴格邊界限制。
  - **Self State 維護**：Skill 具備獨立的自我狀態管理能力，可於執行期間自行新增與維護內部變數。
  - **自動化 Metrics 統計**：系統將底層自動統計每項工具與 Skill 的呼叫成功率/錯誤率、平均時間花費，以及 1% loss 等效能/穩健性指標。
  - **底層安全隔離 (Hardened Sandbox & WASM)**：為解決 Agent 自主編寫不可控程式碼的資安風險，動態生成的 CodeSkill 將被強制限制在嚴格的虛擬沙盒或 WebAssembly (WASM) 容器中執行，徹底防堵越權操作與系統崩潰。
- **具象化 Task 系統與 Worktree 工作區**
  - 新增 Task 系統，讓主腦與開發者能清楚看見每一步驟的執行進度。
  - **步驟級暫存 (Step-level Caching)**：任務的每一次關鍵步驟，都強制與目前的 Git Workspace 系統連動進行暫存隔離，確保隨時可乾淨地回溯與檢查。
  - **多代理人衝突處理 (Multi-Agent Conflict Resolution)**：為未來的多任務並行打下基礎，利用 Git 樹狀分支優勢，自動處理多位 Sub-Agent 同時操作檔案時的 Merge 衝突與狀態合併。
- **動態工具分配 (Configurable Tool Delegation)**
  - 工具資源不再無腦全域掛載。除了高風險工具需嚴格控管外，`MainAgent` 在建立或喚醒子代理人 (Sub-Agent) 時，可根據任務需求，靈活且精準地「分配 (Delegate)」特定的工具集合給子代理人。
