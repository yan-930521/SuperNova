# SuperNova

[English](README_en.md) | [繁體中文](README.md)

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#technical-highlights-系統技術實作)
[![Stage](https://img.shields.io/badge/Stage-v0.2.1-green.svg)](#development-roadmap)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

SuperNova 是一個專注於效能與狀態管理的 **Agent Runtime (代理人執行引擎)**。它運行於 Bun 高性能環境之上，透過事件驅動架構，有效解決長效型 AI 系統常見的上下文爆炸與目標飄移 (Goal Drift) 問題，使 Agent 能在複雜、跨領域的長期任務中保持穩定的認知與執行力。

> **快速導覽 (Quick Navigation)**: 
> - **架構藍圖**: [docs/ARCH.md](docs/ARCH.md)
> - **未來規劃**: [ROADMAP.md](ROADMAP.md) (深入了解 v0.2.1 自主進化藍圖)
> - **更新日誌**: [CHANGELOG.md](CHANGELOG.md)
> - **參與貢獻**: [CONTRIBUTING.md](CONTRIBUTING.md)
>
> **專案前身**: [Proj.Nova](https://github.com/yan-930521/Proj.Nova/)

> [!WARNING]
> **安全性警告 (Security Warning)**
> 由於本專案目前正處於快速迭代與底層架構重構階段，部分執行環境工具（例如：允許 Agent 執行原生 Shell 指令的 `RunBashTool` 等工具）**尚未實作完整的沙盒隔離 (Sandbox) 或嚴格的指令過濾防護**。這意味著系統目前存在潛在的指令注入 (Command Injection) 風險。
> 
> **強烈建議：**
> 1. **僅在受隔離的虛擬機 (VM) 或 Docker 容器內**執行本系統。
> 2. 絕對不要將本系統直接部署於含有機密資料或重要環境變數的生產環境伺服器上。

---

## Prerequisites

- [Bun](https://bun.sh/) >= 1.3.14
- [Git](https://git-scm.com/) >= 2.x
- OpenAI API Key（用於 LLM 推理與 Embedding 向量化）

---

## Quick Start

```bash
# 安裝依賴
bun install

# 配置環境變數
cp .env.template .env
# 編輯 .env 填入你的 OpenAI API Key

# 執行主程式 Demo
bun run demo

# 型別檢查與測試
bun run lint
bun test

# 執行任務系統測試與展示 (Task & DAG)
bun run test:task_lats  # 觀看 LATS 策略規劃與 TaskDAG 生成
bun run test:task       # 觀看多代理人任務指派與自動回報閉環

# 執行記憶系統測試
bun run test:memory     # 觀看圖譜記憶與情節記憶運作

# 執行效能壓測 (Performance Benchmarks)
bun run bench:core      # 測試 LRUCache 與 EventBus 吞吐量
bun run bench:oom       # 測試 10 萬筆歷史對話寫入與 OOM 防禦
```

> **更多設定**：
> - 系統配置請參閱根目錄的 `config.yaml`。

---

## Project Structure

```text
SuperNova (Runtime Kernel)
├── 1. 代理層 (Agent Layer) - 負責思考與決策
│   ├── 1. 代理人與大腦層 (Agent & Brain Layer) - 負責思考與決策
│   ├── MainAgent          (左腦：任務排程、長線規劃、指揮 Sub-Agents)
│   ├── EmbodiedAgent      (右腦：與物理環境互動，具備動態 StateRegistry)
│   ├── ProjectionHandler  (無狀態意識投影機制，管理上下文合併)
│   └── BaseEmbodiedEnv    (多代理人環境抽象層：支援多 Session 掛載與生命週期管理)
│
├── 2. 技能與工具層 (Skill & Tool Layer) - 負責對外互動
│   ├── ToolRegistry       (工具註冊表，支援動態分配 Delegate)
│   ├── BaseTool           (標準靜態工具：讀寫檔案、Bash)
│   └── skill/             (自進化技能生態系)
│       ├── SkillManager   (技能管理器：LRUCache 快取、自動失效 Invalidation)
│       ├── CodeSkill      (可被 LLM 動態編寫、載入的 TypeScript 技能)
│       └── EmbodiedSDK    (暴露給 LLM 閱讀的自描述 SDK)
│
├── 3. 狀態與記憶層 (State & Memory Layer) - 負責長期穩定性
│   ├── SessionManager     (會話收件箱、訊息派發、Agent 狀態凍結/喚醒)
│   ├── MemoryManager      (長期記憶守門員)
│   │   ├── GraphMemory    (圖譜記憶：擷取實體與關係，動態 Prompt 注入)
│   │   └── EpisodicMemory (情節記憶：閒置換日總結，濃縮 AI 日記)
│   └── DataBlock          (資料載體：支援大字串 Blob 卸載、滑動視窗壓縮)
│
├── 4. 排程與通訊層 (Scheduling & Event Layer) - 負責非同步解耦
│   ├── EventBus           (神經網路：非同步發布、宣告式訂閱、隔離安全)
│   └── TaskManager        (排程中心：DAG 依賴解析、級聯取消、背景廣播)
│
├── 5. 基礎設施層 (Infrastructure Layer) - 底層通用支援
│   ├── RuntimeKernel      (生命週期中樞：IoC 容器、啟動/優雅停機)
│   ├── WorkspaceManager   (雙層沙盒：持久層與揮發層 Git Worktree 隔離)
│   ├── repositories/      (檔案/資料庫倉儲：Session, DataBlock, AgentState)
│   └── LogManager         (雙軌日誌：全局報錯 + Agent 專屬 Oplog)
│
└── 6. 業務應用層 (Package/Domain Layer) - 實體應用落地
    └── package/underworld (Minecraft 具身智能沙盒整合)
        ├── BotManager     (管理 mineflayer 實例)
        └── skills/        (具體實作的 Action/Observation Skills)
```

> **架構邊界**：`src/core/` 透過 `src/core/index.ts` 統一匯出。`src/package/` 必須透過此入口引用核心模組，嚴禁深層耦合。

---

## Technical Highlights (系統技術實作)

本專案專注於解決長效型 Agentic System 常見的記憶體耗盡、Token 爆量與狀態管理問題，透過以下具體工程手法實作：

### 1. 核心狀態與排程 (Core State & Scheduling)
- **分離決策與執行迴圈**：將 Agent 拆分為 `MainAgent` (決策中樞)、`TaskAgent` (任務執行) 以及 `EmbodiedAgent` (具身感知)，防止底層程式碼與物理操作細節污染全局 Prompt。

- **動態上下文投影 (Context Projection)**：`MainAgent` 在必要時可無縫接管子代理人 (如 `EmbodiedAgent`)。系統會將該子代理人的獨立歷史紀錄與專屬工具集動態投影 (Projection) 給主腦，使主腦能親自下場操作子工具以完成特定高難度任務。

- **基於 EventBus 的非同步喚醒**：Agent 呼叫工具後即主動 `suspend` (掛起)，待工具執行完畢再由事件流觸發 `resume`，全程無阻塞 (Non-blocking) 等待。

- **狀態持久化 (Dehydrate / Rehydrate)**：當 Agent 處於閒置狀態，系統會將包含歷史紀錄與 Token 消耗等變數序列化寫入磁碟 (JSONL)，並在需要時反序列化還原。

### 2. 記憶體與上下文優化 (Memory & Context Optimization)
- **大字串卸載 (Payload Offloading)**：當系統偵測到單次輸入超過字元閾值，會自動將內容寫入實體 Blob 檔案，並在 Prompt 中替換為短字串 `DataPointer`，避免耗盡 Token 上限。

- **圖向量混合記憶 (Graph & Episodic Memory)**：
  - **長期記憶 (Graph Memory)**：當未處理訊息達到設定閾值時，觸發背景 LLM 將對話轉譯為原子化實體與關係，並使用 OpenAI Embeddings 轉換為向量儲存。<br/>在 Agent 思考前，系統透過餘弦相似度 (Cosine Similarity) 自動檢索關聯圖譜並無縫注入 Prompt，達成上下文感知。
  - **情節記憶 (Episodic Memory)**：利用心跳引擎動態追蹤換日點，在使用者閒置時觸發背景 LLM，將單日雜亂對話收斂為「AI 私人日記」。<br/>系統會在後續對話中自動載入近期日記，保留互動氛圍與使用者偏好。

- **歷史壓縮 (History Compaction)**：為了解決長文本延遲，系統採用滑動視窗機制。掉出視窗的老舊對話紀錄會被執行高強度的 Offloading 壓縮並落盤，搭配 O(1) 檢查標記，極速略過已壓縮區塊。

### 3. 工程基礎建設 (Infrastructure)
- **領域驅動與乾淨架構 (Clean Architecture & DDD)**：將抽象介面完全提取至 `domain` 層進行解耦，底層實作細分為 `infra/repositories`, `infra/storage`, `infra/llm` 等獨立模組，搭配集中式的 `prompts/` 管線，為系統的長遠演化與多代理人擴展打下強固的地基。

- **動態配置引擎 (Zod-based Config Engine)**：全系統採用 Zod Schema 進行強型別組態定義，並支援即時動態覆寫與生成 YAML 格式設定檔（附帶註解），確保各模組 (Storage, Memory, LLM) 啟動時的防呆機制。

- **Git Worktree 工作區隔離 (Workspace Isolation)**：為每一個 Session 開闢獨立的 Git Worktree，Agent 的任何檔案讀寫與工具操作皆被限制在專屬的分支目錄中。<br/>這不僅確保操作可追溯與可 `git checkout` 回滾，未來更能完美支援多代理人 (Multi-Agent) 並發協作時的 Git Merge 衝突處理與狀態合併。

- **全非同步併發架構 (Full Async Concurrency)**：整份專案大量運用併發操作處理高 I/O 任務 (例如：平行寫入多個 Session 日誌、批次離線壓縮記憶體、並行呼叫外部 LLM API)，充分利用 Event Loop 的並行能力，確保 AI 代理在處理龐大上下文時絕不被 I/O 阻塞拖慢。

- **泛型 LRU 快取與 Memoization**：底層實作獨立且可重用的泛型 `LRUCache` (如維護上限 50 Key)，搭配增量快取機制，杜絕記憶體無限膨脹並大幅消除重複的序列化開銷。

### 4. 多代理人協作與委派 (Multi-Agent Delegation)
- **任務儀表板動態注入 (Task Dashboard Injection)**：透過 `BeforeAgentStep` Hook，系統會在每次 Agent 思考前，動態向 System Prompt 注入任務儀表板。對任務創建者顯示全局 DAG 樹狀圖，對受指派的子代理人只顯示專屬目標，徹底解耦 Agent 與單一任務的綁定關係，支援多任務委派。

- **自動化調度閉環 (Orchestration Loop)**：將 `SpawnAgentTool` 與 `AssignTaskTool` 職責分離，搭配 `UpdateTaskStatusTool` 讓 Agent 完工後自動回報。配合 `TaskManager` 的自動事件推播，完成從指派、執行到解鎖下游任務的全自動化閉環。

- **非同步事件任務引擎 (Async Task & TaskDAG)**：實作 `StrategizeAndPlanTool` 作為非同步背景任務。<br/>MainAgent 在呼叫工具後能立即釋放資源處理其他訊息，待背景生成完畢後再由 `EventBus` 強行插針回報任務進度，達成全非同步並發。

- **LATS 策略規劃引擎 (Language Agent Tree Search)**：在將任務分解為 TaskDAG 之前，引擎會自動透過 MCTS (蒙地卡羅樹狀搜尋) 與 UCB1 演算法，對目標進行深度的自我推演、打分與反思，搜尋出最佳解題軌跡，杜絕 Agent 陷入局部最佳解。

- **細粒度工具權限分配**：系統在喚醒或生成 Agent 時能動態篩選出該代理人被允許使用的特定工具，達成權限邊界的嚴格劃分。

- **自主子代理生命週期**：`MainAgent` 能夠隨時建立臨時的 `TaskAgent`，指派目標、工作區與特定工具，而這些臨時子代理在完成任務後，會透過 `UpdateTaskStatusTool` 自動由系統回收狀態，釋放系統資源。

- **Agent級工作區驅動實例**：底層 I/O 在處理工作區讀寫時，使用 `agentId` 映射獨立儲存驅動（如純記憶體 VOLATILE 或 Git PERSISTENT），即使在同一 Session 底下，不同的子代理也能擁有各自的隔離空間。

### 5. 具身智能與可進化編碼 (Virtual Embodied AI & Evolvable Code)
- **泛型化外部環境 SDK (Generic Env SDK)**：徹底解耦特定環境 (如 Minecraft) 上下文，系統採用 TS 泛型與動態宣告注入，使 Agent 能無縫適配 Line Bot、爬蟲等任意外部領域。

- **自我進化技能生態 (Self-Evolving CodeSkill)**：允許 Agent 在執行期動態寫入「實體 TypeScript 程式碼」作為技能，具備自我狀態 (Self State) 與自我優化能力。
  - **版本與指標控制**：系統底層自動產生版本號 (`skillver_xxx`) 並計算每版工具的勝率、損耗率。
  - **自動退版 (Auto-Rollback)**：當 Agent 發覺新碼報錯，可主動呼叫退版工具，無縫回復至歷史勝率最高的穩定版本，達成「創造-測試-除錯-修復」的全自動閉環 (Self-Healing Loop)。

---

## Development Roadmap

| 版本 | 階段 | 概述 |
|:---|:---|:---|
| **v0.1.0** | 已完成 | 奠定非同步 EventBus、動態圖譜記憶與滑動視窗隔離的穩健基礎設施 |
| **v0.2.1** | 已完成 | 引入虛擬具身智能 (Virtual Embodied AI)、任務排程與可進化 CodeSkill 系統 |

> 詳細規劃請參閱 [ROADMAP.md](ROADMAP.md)。

---

## 效能實測 (Performance Benchmark)

SuperNova 透過內建的 `mitata` 進行極端壓力測試，以下為在一般消費級環境 (12th Gen i5 / Windows 11 / Bun 1.3.14) 上的表現，證明了在面對超大上下文與高頻事件時，核心基礎設施的 I/O 吞吐能力：

```text
benchmark                                        avg (min … max) p75 / p99    (min … top 1%)
---------------------------------------------------------------- -------------------------------
LRUCache: Set & Evict (Triggering eviction logic) 102.27 µs/iter  71.40 µs █                    
                                           (28.60 µs … 13.30 ms) 697.30 µs █                    
                                         (  0.00  b … 264.00 kb)  11.45 kb ██▄▃▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁

LRUCache: Get (Hit)                               436.79 ns/iter 362.48 ns  █                   
                                           (273.46 ns … 2.38 µs)   1.39 µs ▄█                   
                                         (  0.00  b … 485.00  b)  14.71  b ██▆▃▁▁▁▁▁▁▁▂▂▁▁▂▂▂▂▁▂

EventBus: High-frequency Publish                  784.82 ns/iter 782.74 ns  █                   
                                           (588.79 ns … 5.44 µs)   2.45 µs ▆█▄                  
                                         ( 96.00  b …   1.94 kb) 449.52  b ███▅▄▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
```
> **數據解讀**：
> - **記憶體快取命中 (LRUCache Hit)**：每次耗時不到 1 微秒，吞吐量高達 **228 萬次/秒**。
> - **核心事件派發 (EventBus Publish)**：全非同步廣播耗時低於 1 微秒，吞吐量約 **127 萬次/秒**，徹底杜絕了多代理人協作時的 I/O 阻塞瓶頸。
> - **防禦 OOM 測試 (10萬筆資料寫入)**：在瞬間灌入 500 MB (10萬筆) 的巨量歷史對話時，系統僅耗時 **2.1 秒** 寫入完畢，且透過滑動視窗與垃圾回收機制，將記憶體穩定控制在約 300MB，**有效防止 OOM 崩潰**。

---

## Design Decisions

### Why Bun?

| 考量 | 選擇理由 |
|------|---------| 
| 啟動與執行效率 | Bun 的冷啟動速度與運行時效能遠超傳統 Node.js，適合 Agent 高頻長時運行 |
| 原生 TypeScript | 無需額外編譯步驟，直接執行 `.ts` 檔案 |
| 測試框架 | 內建高效的 `bun test` 運行器 |
| 依賴管理 | 極速的套件安裝與精簡的鎖定檔機制 |

---

## Contributing

歡迎貢獻！請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md) 了解開發規範與提交流程。

## License

本專案採用 [Apache License 2.0](LICENSE) 授權。

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.
