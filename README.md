# SuperNova

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#architecture-highlights)
[![Stage](https://img.shields.io/badge/Stage-v0.1.0-green.svg)](#development-roadmap)

SuperNova 是一個專注於效能與狀態管理的 **Agent Runtime (代理人執行引擎)**。它運行於 Bun 高性能環境之上，透過事件驅動架構，有效解決長效型 AI 系統常見的上下文爆炸與目標飄移 (Goal Drift) 問題，使 Agent 能在複雜、跨領域的長期任務中保持穩定的認知與執行力。

> **快速掌握架構**: 請優先閱讀 [docs/ARCH.md](docs/ARCH.md) 以獲取最新的系統設計藍圖。
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
- **背景知識圖譜 (Background Graph Memory)**：當未處理訊息達到設定閾值 (例如 50 筆) 時，觸發背景 LLM 任務，直接將歷史對話轉譯為 JSON 格式的事實三元組 (Subject-Predicate-Object) 並儲存。
- **歷史壓縮 (History Compaction)**：為了解決長文本延遲，系統採用滑動視窗機制。掉出視窗的老舊對話紀錄會被執行高強度的 Offloading 壓縮並落盤，避免歷史對話無限增長拖垮效能。
- **換日防打斷總結 (Cross-Day Idle Summary)**：利用心跳引擎 (Tick Engine) 動態追蹤換日點。當跨越配置的換日時間後，系統會啟動防打斷倒數，確信使用者完全進入閒置休眠狀態後，才觸發背景 LLM 將當日雜亂的對話收斂為精煉的 Markdown 每日總結，並執行底層 JSONL 檔案的日期輪替 (Log Rotation)。

### 3. 工程基礎建設 (Infrastructure)
- **Git Worktree 沙盒隔離**：為每一個 Session 開闢獨立的 Git Worktree，Agent 的任何檔案讀寫與工具操作皆被限制在該目錄，確保操作可追溯且可 `git checkout` 回滾。
- **全非同步併發架構 (Full Async Concurrency)**：整份專案大量運用併發操作處理高 I/O 任務 (例如：平行寫入多個 Session 日誌、批次離線壓縮記憶體、並行呼叫外部 LLM API)，徹底榨乾 Event Loop 效能，確保 AI 代理在處理龐大上下文時絕不被 I/O 阻塞拖慢。
- **泛型 LRU 快取與 Memoization**：底層實作獨立且可重用的泛型 `LRUCache` (如維護上限 50 Key)，搭配增量快取機制，杜絕記憶體無限膨脹並大幅消除重複的序列化開銷。

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

# 型別檢查
bun run lint
```

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.
