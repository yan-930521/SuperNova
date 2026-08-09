# SuperNova 開發日誌 (Changelog)

所有關於 SuperNova 系統的重要變更、架構重構與效能優化都將記錄於此文件中。

本文件遵循 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) 規範，並使用 [Semantic Versioning](https://semver.org/spec/v2.0.0.html) 進行版本控制。

---

## [0.2.0] - 2026-08-09
### Added (新增功能與基礎設施)
- **具身智能自我進化生態系 (Embodied Agent Self-Evolving CodeSkill Ecosystem)**：
  - **技能指標與版本控制 (CodeSkill Versioning & Rollback)**：引進指標儲存機制 (Indirection)，技能腳本以 `skillver_xxx` 的動態版號儲存於實體檔案，不再直接覆寫。當新版程式碼在 `execute_code_skill` 中執行失敗，系統會記錄該版本的損耗率，並提供 `rollback_code_skill` 讓 Agent 能夠退回勝率最高的歷史穩定版。
  - **技能唯讀與維護工具 (Read & Manage CodeSkills)**：新增 `read_code_skill`、`list_skill_versions` 與 `delete_code_skill` 工具，讓 Agent 得以自由讀取舊版原始碼、列出歷史成績清單，或是刪除無用技能以節省 System Prompt Token。這完整了感知、創造、除錯與退版的自動化閉環 (Self-Healing Loop)。
  - **泛型化外部環境 SDK (Generic Env SDK)**：將 Minecraft 特定的 `IBotContext` 從核心模組抽離。`EmbodiedAgent` 現改為透過 `AgentOptions.envSdkDeclaration` 接收外部的 TS 介面宣告，並利用泛型 `<TEnv = any>` 串接環境，實現真正的領域驅動解耦 (DDD)，使 Agent 能夠輕鬆適配任何外部環境 (如 Line Bot、網頁爬蟲等)。
  - **EmbodiedAgent 預設工具註冊 (Default Tool Registration)**：擴充 `AgentManager` 的 `getDefaultTools`，在生成 Embodied 類型代理人時，自動掛載上述全套 CodeSkill 管理工具。
- **多代理人任務排程系統 (Task & TaskDAG System)**：
  - **任務儀表板動態注入 (Task Dashboard Injection)**：透過 `BeforeAgentStep` Hook 攔截器，系統會在每次 Agent 思考前，自動且動態地向 System Prompt 注入任務儀表板。對任務創建者顯示全局 DAG 樹狀圖，對受指派者則只顯示專屬目標，徹底解耦 Agent 與單一任務的綁定關係。
  - **任務指派與回報閉環 (Dispatch & Report Loop)**：重構 `SpawnAgentTool`，剝離指派邏輯至全新的 `AssignTaskTool`，並實作 `UpdateTaskStatusTool` 讓 Agent 完工後自動依據身上綁定的 ID 進行回報。配合 `TaskManager` 的自動事件推播，完成從指派、執行到解鎖下游任務的全自動化閉環。
  - **LATS 策略規劃引擎 (Language Agent Tree Search)**：實作基於 MCTS (蒙地卡羅樹狀搜尋) 與 UCB1 演算法的前置規劃引擎，Agent 在面對複雜任務時，會先在自然語言層面自我推演、打分與反思，搜尋出最佳解題軌跡，杜絕陷入局部最佳解。
  - **TaskDAG 依賴圖翻譯**：將 LATS 產生的文字策略無縫交由 LLM 翻譯為精確的 Task JSON，並交由背景 `TaskManager` 維護，支援依賴解鎖與防呆。
  - **非同步事件驅動工具 (Async + Event-driven Tools)**：`StrategizeAndPlanTool` 正式改寫為非同步背景任務。工具呼叫後立即釋放 Agent 狀態，任務完成後再透過 EventBus 強行插針 (Inject) 發送 `BACKGROUND_TASK_COMPLETED` 訊息，徹底解放 Agent 運算效能與多工能力。
- **多代理人動態委派系統 (Multi-Agent Dynamic Delegation)**：
  - **防呆與提醒機制 (Anti-Air-Talking)**：強化 `SendMessageTool`，在發送跨 Agent 訊息時，系統會自動在尾部加上強力提示，教導接收方正確使用工具回覆，徹底解決 LLM 「對空氣說話 (Air-Talking)」的痛點。
  - **ToolRegistry 解耦與反轉控制**：將 `ToolRegistry` 由全域 DI 容器抽離，改為受 `AgentManager` 內部直轄的無狀態管理員，徹底解決模組間的循環依賴。
  - **SpawnAgentTool 與自動生命週期管理**：`MainAgent` 現在擁有直接產出任務型子代理人 (TaskAgent) 的能力，可動態指派目標 (Objective)、工作區隔離級別 (WorkspaceType) 與工具權限 (AllowedTools)；而子代理人在設定為 `isTemp: true` 的情況下，會在完成所有任務並呼叫 `UpdateTaskStatusTool` 後自動由系統銷毀，釋放資源。
  - **細粒度工具權限分配 (Configurable Tool Delegation)**：透過新的 ToolRegistry 架構，系統在喚醒或生成 Agent 時能動態篩選出該代理人被允許使用的特定工具，達成權限邊界的嚴格劃分。

### Changed (效能與架構優化)
- **Prompt 與 Schema 集中化管理**：
  - 將所有散落於各模組的 System Prompts 與 Zod 結構化輸出 Schema 統一遷移至 `src/core/prompts/` (例如 `task.prompt.ts`)，並透過統一管線載入，實現演算法邏輯與提示詞的完全解耦。
- **領域驅動與乾淨架構重構 (Clean Architecture & DDD Refactoring)**：
  - 徹底分離 `domain`, `infra`, `tools`, `prompts` 四大核心目錄。將抽象介面層提取至 `domain`，將對外部依賴較深的具體實作扁平化至 `infra/repositories` 與 `infra/storage`。
  - 將工具系統抽離 Agent 模組至專屬的 `tools/` 目錄，為未來的 Agent-Evolvable CodeSkill 動態掛載與沙盒系統打下堅實基礎。

### Fixed (穩定性與併發修復)
- **多代理人工作區驅動器衝突 (Workspace Driver Resolution Conflict)**：
  - 修復了同一個 Session 下若存在多個代理人，在存取 `WorkspaceManager` 時無法分別綁定不同驅動型態 (例如 `GitLocalStorageDriver` vs `MemoryVfsStorageDriver`) 的重大缺陷，將底層的快取對應鍵 (Cache Key) 由 `sessionId` 修正為 `agentId`，完整實踐了代理人級別的工作區實體隔離。

---

## [0.1.0] - 2026-08-07

### Added (新增功能與基礎設施)
- **圖向量混合記憶系統 (Graph & Episodic Memory System)**：
  - **長期記憶 (Graph Memory)**：系統可自動在背景將對話提煉為原子化的實體 (Entities) 與關係 (Relations) 網路，並結合 OpenAI Embeddings 轉換為向量儲存。
  - **情節記憶 (Episodic Memory)**：具備換日總結功能，能將冗長的對話歷史自動濃縮為「AI 的私人日記」，保存情境與使用者潛規則。
  - **動態上下文檢索與注入 (Dynamic Context Retrieval)**：系統具備「回想」能力，在 Agent 執行每一步驟前，會根據當下情境透過向量相似度 (Cosine Similarity) 自動尋找相關的圖譜記憶，並連同近期日記一併無縫注入到大腦 (System Prompt) 中。
- **工作區隔離 (Workspace Isolation)**：
  - 實作 Git Worktree 工作區隔離機制，確保會話 (Session) 的檔案狀態獨立。這也為未來處理多代理人 (Multi-Agent) 協作時的 Git 衝突 (Conflict) 解決與狀態合併打下穩固基礎。
- **歷史與快取 (History & Cache)**：
  - 新增滑動視窗 (Sliding Window) 歷史壓縮功能，以及通用的 LRUCache。
- **示範程式 (Demo)**：
  - 建立 `demo/v0.1.0.ts`，展示透過 EventBus 非同步訊息傳遞的互動式 CLI ReAct 執行迴圈。
- **歷史檔案安全上限 (History Safety Cap)**：
  - 在 `FileSystemDataBlockRepository` 中新增 `max_history_lines_safety_cap` 保護機制。當底層讀取極端龐大的 JSONL 檔案時，會在執行耗時的 JSON 反序列化前強制切片 (Slice)，確保系統與記憶體絕對不會被惡意或異常的大型歷史檔案撐爆。
- **歷史壓縮短路機制 (Compaction Fast-Fail)**：
  - 在 `DataBlock` 及其序列化介面中新增 `isOffloaded` 持久化標記，使 `SessionManager` 在進行背景歷史壓縮時能透過 $O(1)$ 檢查極速短路，完全免除對已壓縮區塊的冗餘字串掃描，大幅減輕 OOM 壓力。
- **記憶體快取基礎設施 (LRUCache)**：
  - 實作了專屬的 `LRUCache` 工具類別，為系統的高頻存取提供安全且具有容量上限的快取機制，防止記憶體無上限增長 (`d4616a1`, `fc9d249`)。
- **會話與代理人狀態管理 (Session & Agent State)**：
  - 在會話層 (Session) 導入 Projection State (意識投影狀態) 以及嚴格管控的 Inbox 佇列機制，加強狀態隔離與並行控制 (`af6d3d4`)。
  - 將 Agent 執行模型重構為「無狀態執行 (Stateless Execution)」，並實作了基於 React 模式的 Agent 快取及 `ProjectionHandler`，大幅提升併發處理能力 (`3603fb8`)。
- **透明化的 ReAct 執行迴圈**：
  - 支援將 LLM 內部的思考過程 (Thoughts) 與工具執行狀態 (Tool Blocks) 以陣列格式完整捕獲與透傳，大幅提升非同步呼叫時的可觀測性 (`2bbb34d`, `cac7a25`)。
- **組態設定轉移 (Config)**：
  - 於 `Config.ts` 與 `DefaultConfig.ts` 新增 `event_bus_lru_size`，允許外部配置 EventBus 監聽者快取上限 (`f949420`)。

### Changed (效能與架構優化)
- **組態引擎翻新 (Config Engine)**：
  - 翻新組態引擎，使用 Zod 進行動態 Schema 遍歷，並全面改用 YAML 格式生成與讀取設定檔，大幅提升開發者可讀性與維護性。
- **記憶體管線 (Memory Pipeline)**：
  - 簡化背景記憶管線，改為單一階段的圖記憶體 (Graph Memory) 萃取。
- **歷史寫入批次優化 (Batch I/O Pipelining)**：
  - 升級 `FileSystemDataBlockRepository` 與 `IRepository`，支援陣列傳入與單次檔案追加寫入 (Single I/O)。
  - 重構 `SessionManager.handleAgentMessage`，將高頻到達的訊息按 Agent 分組打包後批次寫入，徹底解決大流量廣播時造成的磁碟 N+1 I/O 阻塞瓶頸。
- **組態設定轉移 (Config)**：
  - 將 `SessionManager` 中關於 Payload 卸載的硬編碼閾值 (Magic Numbers) 正式抽離，於 `Config.ts` 新增 `offload_threshold_new_message` 與 `offload_threshold_compact`，並全面將變數正名為 `thresholdLength` 以反映其實際計算字元的行為。
  - 在 `FileSystemDataBlockRepository` 實作防禦性設定讀取 (Defensive Config Fallback)。所有 `this.config` 呼叫皆加上可選串連 (`?.`) 並搭配 `DEFAULT_CONFIG` 作為保底退路，達成底層儲存庫的零硬編碼與絕對防崩潰能力。
- **Agent 模組優化 (BaseAgent & ProjectionHandler)**：
  - 汰除 `buildProfilePromptSections` 中的字串串接方式 (`+=`)，改用高效的陣列 `join` 以降低 V8 引擎的垃圾回收負擔 (`9acad0a`)。
  - 為 `generateToolsSignature` 與 `profileHash` 導入 `WeakMap` 快取，阻斷極度消耗 CPU 的重複雜湊計算 (`9acad0a`)。
  - 將 `callModel` 尋找工具的演算法由 `O(N²)` 的巢狀迴圈改寫為 `O(N)` 的 Map 查找 (`9acad0a`)。
  - 升級 `ProjectionHandler.getMergedHistory` 的歷史合併演算法，由 `O(N log N)` 的 `concat+sort` 升級為 `O(N)` 的雙指標合併 (Two Pointers Merge) (`6e049c7`)。
  - 優化 Agent 併發處理與管線化 (Pipelining) 機制，並實作殭屍監聽者 (Zombie Listener) 清理機制與時間上下文注入 (Temporal Context Injection) (`45de2a5`)。
- **訊息與通訊層優化 (Messaging & EventBus)**：
  - 在 `DataBlock` 的大小驗證 (`validateSize`) 中，拋棄耗時的 `Buffer.byteLength` 運算，改用 `O(1)` 的字串 `.length` 檢查，減緩 Event Loop 阻塞 (`0a6f4fc`)。
  - 實作 DataBlock 增量快取，並將 EventBus 派發事件時建立的陣列與 `Set` 改為 `LRUCache` 進行事件監聽者快取，徹底根除高頻廣播時的 GC 壓力 (`f949420`, `b930c64`)。
  - 全面重構 `AgentMessage` 與底層元件，支援以陣列形式 (Array Payloads) 傳遞事件，優化 `SessionManager.handleAgentMessage` 以批次處理資料塊，降低 I/O 呼叫頻率 (`cac7a25`, `a97e4c1`)。
- **儲存與基礎設施優化 (Infrastructure & Utils)**：
  - 針對 `FileSystemDataBlockRepository` 實作大型 Payload 的自動卸載 (Offloading) 與儲存機制，確保主記憶體不被巨型訊息溢位 (`d4616a1`)。
  - 將 `IdGenerator` 中高頻呼叫的 `crypto.randomBytes` 汰換為輕量的 `Math.random` 8 碼 Hex 生成，降低 CPU 負載 (`9292761`)。
  - 替 `PromptLoader` 加入 TTL (Time-To-Live) 快取機制，並針對 Console 輸出與 `FileTransport` 日誌寫入進行非同步優化與延遲壓縮 (`c02655d`, `2906556`)。
- **文件與測試更新**：
  - 針對無狀態併發架構更新整合測試 (Integration Tests)，並清理舊有的測試範例 (`0282b35`)。
  - 同步更新架構藍圖 (`ARCH.md`, `agent.md`, `memory.md`) 以及 `README.md`，反映最新的效能優化、LRUCache 基礎設施與 ReAct 迴圈透明化機制 (`80bd4d1`, `d4616a1`)。

### Fixed (穩定性與併發修復)
- **會話載入競爭 (Session Load Race)**：
  - 徹底重構 `SessionManager` 監聽高頻事件 (`handleAgentMessage`, `handleProjectionToggled`) 的底層邏輯，拔除多餘的非同步硬碟打撈 (`loadSession`)，全面改採 Fail-Fast 策略，完全消滅高併發下造成的會話載入競爭與互相覆蓋問題。
- **代理人初始化狀態外洩 (Agent Initialization State Leak)**：
  - 修復 `AgentManager.spawnAgent` 存在半成品暴露的風險。將 `addAgentToPool` 延後至工作區掛載與工具綁定等 I/O 阻塞操作全數完成、且狀態切換為 Ready 後才執行，保障了活躍池中 Agent 的絕對完整性。
- **優雅停機冪等性 (Graceful Shutdown)**：
  - 在 `RuntimeKernel` 引入 `isShuttingDown` 旗標鎖。當遭受連續的作業系統中斷信號 (例如連續觸發 `Ctrl+C` 或 `SIGINT`) 時，能有效防堵關閉流程被重複觸發，確保系統安全卸載 (`ee25ece`)。
- **快取一致性與競爭防禦 (Concurrency Race)**：
  - 修正了 `ProjectionHandler.resume` 在利用 `Promise.all` 進行高併發歷史還原時，快取可能被互相污染的問題。採用即時快取失效 (Eager Cache Invalidation) 策略，在享有全速併發的同時保障資料庫寫入的絕對順序 (`6e049c7`)。
