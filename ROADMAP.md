# SuperNova 專案開發藍圖 (Roadmap)

本文件概述了 SuperNova（基於 TS/Bun 的 Agent Runtime）近期的核心里程碑與未來發展願景。

## v0.1.0 - Foundation & Memory System (已完成)

目前已完成 SuperNova 核心基礎設施與「圖向量混合記憶系統」的建置，為後續的自主進化打下穩固根基。

### 核心技術亮點 (Technical Highlights)
1. **圖向量混合記憶 (Graph & Episodic Memory System)**
   - **長期記憶 (Graph Memory)**：透過 LLM 自動提煉原子化實體 (Entities) 與關係 (Relations)，結合 OpenAI Embeddings 與 Vectra 本地向量資料庫進行儲存。
   - **情節記憶 (Episodic Memory)**：透過每日換日機制，將凌亂的對話自動濃縮為「AI 日記」，保留互動氛圍與使用者的潛規則。
   - **動態上下文檢索 (Dynamic Context Injection)**：實作 `BeforeAgentStep` 生命週期 Hook，自動尋找高關聯圖譜記憶與近期日記，無縫注入大腦。
2. **底層架構與配置 (Architecture & Config)**
   - **動態配置引擎 (Zod-based Config Engine)**：採用 Zod Schema 進行強型別校驗與動態覆寫，全面支援 YAML 格式設定檔生成與讀取，提供極佳的防呆與配置彈性。
   - **工作區隔離 (Two-Tier Workspace Isolation)**：實作「持久層」與「揮發層」兩級工作區，保證 Session 具備隔離的實驗沙盒。
   - **異步事件驅動 (Asynchronous EventBus)**：完全摒棄直接 Method Call，所有生命週期與狀態切換均走 EventBus，具備防卡死與高度解耦。
3. **效能與穩健性 (Performance & Reliability)**
   - **歷史壓縮短路機制 (Compaction Fast-Fail)**：導入 `isOffloaded` 標記，在背景歷史壓縮時達成 $O(1)$ 極速短路檢查，大幅減輕 OOM 壓力。
   - **快取基礎設施 (LRUCache)**：引入通用 LRUCache 與增量快取機制，消滅高頻事件廣播與歷史打撈造成的記憶體無上限增長。
   - **歷史檔案安全保護 (History Safety Cap)**：強制實作防禦性 JSONL 檔案讀取切片，防止惡意巨型檔案癱瘓記憶體。
4. **代理人與會話管理 (Agent & Session State)**
   - **無狀態執行與意識投影 (Stateless & Projection)**：導入會話層 Projection State，並將 Agent 升級為無狀態執行模式，大幅提升併發處理能力與狀態隔離性。
   - **透明化 ReAct 迴圈 (Transparent ReAct Loop)**：完整捕獲 LLM 思考過程 (Thoughts) 與工具執行狀態，建立高可觀測性的互動基礎 (`demo/v0.1.0.ts`)。
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
- **具象化 Task 系統與 Worktree 工作區 (已完成)**
  - 新增 Task 系統，讓主腦與開發者能清楚看見每一步驟的執行進度。
  - **技術亮點 (Technical Highlights)**：
    - **LATS 策略搜尋引擎**：結合 MCTS (蒙地卡羅樹狀搜尋) 與 UCB1 演算法，在生成 DAG 之前先進行深度與廣度的策略搜尋與反思，找出最佳解題路徑。
    - **非同步事件排程**：`TaskManager` 與 `StrategizeAndPlanTool` 全面整合 EventBus，以背景執行與事件插針 (Event Injection) 完全解放 Agent 的多工並發能力。
  - **步驟級暫存 (Step-level Caching)**：任務的每一次關鍵步驟，都強制與目前的 Git Workspace 系統連動進行暫存隔離，確保隨時可乾淨地回溯與檢查。
  - **多代理人衝突處理 (Multi-Agent Conflict Resolution)**：為未來的多任務並行打下基礎，利用 Git 樹狀分支優勢，自動處理多位 Sub-Agent 同時操作檔案時的 Merge 衝突與狀態合併。
- **動態工具分配 (Configurable Tool Delegation) (已完成)**
  - 工具資源不再無腦全域掛載。除了高風險工具需嚴格控管外，`MainAgent` 在建立或喚醒子代理人 (Sub-Agent) 時，可根據任務需求，靈活且精準地「分配 (Delegate)」特定的工具集合給子代理人。
  - **技術亮點 (Technical Highlights)**：
    - 將 ToolRegistry 改由 AgentManager 直轄的無狀態物件，不再依賴全域單例，達成完全的生命週期反轉控制。
    - 支援 SpawnAgentTool 生成免洗代理人 (`isTemp: true`)，並自動強迫配置 `TerminateSelfTool`，同時結合 WorkspaceManager 以 agentId 映射工作區驅動機制，實現了安全的隔離與任務完結後的記憶體釋放。
- **底層領域架構升級 (Domain-Driven Refactoring) (已完成)**
  - 針對多代理人帶來的程式碼複雜度，預防性地完成了 Clean Architecture 的目錄重構。
  - **技術亮點 (Technical Highlights)**：
    - 萃取出純粹的 `domain` 層，將所有 IRepository, IEventBus 等核心介面獨立解耦。
    - 扁平化底層 `infra` 資料夾為 `llm`, `repositories`, `storage`, `workspace`，解決原先高達 5 層的巢狀依賴地獄。
    - 集中管理大腦設定檔於 `prompts/`，為不同職責的子代理人提供更整潔的注入管線。
