# SuperNova

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#architecture-highlights)
[![Stage](https://img.shields.io/badge/Stage-v0.1.0-green.svg)](#development-roadmap)

SuperNova 是一個專注於效能與狀態管理的 **Agent Runtime (代理人執行引擎)**。它運行於 Bun 高性能環境之上，透過事件驅動架構，有效解決長效型 AI 系統常見的上下文爆炸與目標飄移 (Goal Drift) 問題，使 Agent 能在複雜、跨領域的長期任務中保持穩定的認知與執行力。

> **快速導覽 (Quick Navigation)**: 
> - **架構藍圖**: [docs/ARCH.md](docs/ARCH.md)
> - **未來規劃**: [ROADMAP.md](ROADMAP.md) (深入了解 v0.2.0 自主進化藍圖)
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
  - **長期記憶 (Graph Memory)**：當未處理訊息達到設定閾值時，觸發背景 LLM 將對話轉譯為原子化實體與關係，並使用 OpenAI Embeddings 轉換為向量儲存。在 Agent 思考前，系統透過餘弦相似度 (Cosine Similarity) 自動檢索關聯圖譜並無縫注入 Prompt，達成上下文感知。
  - **情節記憶 (Episodic Memory)**：利用心跳引擎動態追蹤換日點，在使用者閒置時觸發背景 LLM，將單日雜亂對話收斂為「AI 私人日記」。系統會在後續對話中自動載入近期日記，保留互動氛圍與使用者偏好。
- **歷史壓縮 (History Compaction)**：為了解決長文本延遲，系統採用滑動視窗機制。掉出視窗的老舊對話紀錄會被執行高強度的 Offloading 壓縮並落盤，搭配 `$O(1)$` 檢查標記，極速略過已壓縮區塊。

### 3. 工程基礎建設 (Infrastructure)
- **動態配置引擎 (Zod-based Config Engine)**：全系統採用 Zod Schema 進行強型別組態定義，並支援即時動態覆寫與 `__keyname` 註解導出，確保各模組 (Storage, Memory, LLM) 啟動時的防呆機制。
- **Git Worktree 工作區隔離 (Workspace Isolation)**：為每一個 Session 開闢獨立的 Git Worktree，Agent 的任何檔案讀寫與工具操作皆被限制在專屬的分支目錄中。這不僅確保操作可追溯與可 `git checkout` 回滾，未來更能完美支援多代理人 (Multi-Agent) 並發協作時的 Git Merge 衝突處理與狀態合併。
- **全非同步併發架構 (Full Async Concurrency)**：整份專案大量運用併發操作處理高 I/O 任務 (例如：平行寫入多個 Session 日誌、批次離線壓縮記憶體、並行呼叫外部 LLM API)，徹底榨乾 Event Loop 效能，確保 AI 代理在處理龐大上下文時絕不被 I/O 阻塞拖慢。
- **泛型 LRU 快取與 Memoization**：底層實作獨立且可重用的泛型 `LRUCache` (如維護上限 50 Key)，搭配增量快取機制，杜絕記憶體無限膨脹並大幅消除重複的序列化開銷。

---

## Development Roadmap

- **v0.1.0 (Current MVP)**: 奠定非同步 EventBus、動態圖譜記憶與滑動視窗隔離的穩健基礎設施。
- **v0.2.0 (Code-based Evolution)**: 引入**虛擬具身智能 (Virtual Embodied AI)** 與**可進化 CodeSkill 系統**。使 Agent 能夠針對自身程式碼工具進行自我撰寫、重構與優化，並搭配自動化 Metrics（成功率、延遲）達成演算法級別的自主進化。同步實作步驟級的 Git Worktree Task 快取與動態工具分配 (Tool Delegation) 以增強系統可靠性。

---

## 效能實測 (Performance Benchmark)

SuperNova 透過內建的 `mitata` 進行極端壓力測試，以下為在一般消費級 CPU (12th Gen i5) 上的表現，證明了在面對超大上下文與高頻事件時，核心基礎設施的 I/O 吞吐能力：

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
> - **防禦 OOM 測試 (10萬筆資料寫入)**：在瞬間灌入 500 MB (10萬筆) 的巨量歷史對話時，系統僅耗時 **2.1 秒** 寫入完畢，且透過滑動視窗與垃圾回收機制，將記憶體死死封鎖在 300MB 出頭，**絕不發生 OOM 崩潰**。

---

## Why Bun?

| 考量 | 選擇理由 |
|------|---------|
| 啟動與執行效率 | Bun 的冷啟動速度與運行時效能遠超傳統 Node.js，適合 Agent 高頻長時運行 |
| 原生 TypeScript | 無需額外編譯步驟，直接執行 `.ts` 檔案 |
| 測試框架 | 內建高效的 `bun test` 運行器 |
| 依賴管理 | 極速的套件安裝與精簡的鎖定檔機制 |

---

## Quick Start

```bash
# 安裝依賴
bun install

# 執行主程式 Demo
bun run demo

# 型別檢查與測試
bun run lint
bun test

# 執行效能壓測 (Performance Benchmarks)
bun run bench:core  # 測試 LRUCache 與 EventBus 吞吐量
bun run bench:oom   # 測試 10 萬筆歷史對話寫入與 OOM 防禦
```

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.
