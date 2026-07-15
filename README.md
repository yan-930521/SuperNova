# SuperNova: A Persistent Agent Runtime for Autonomous Coordination

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#-核心架構亮點-key-features)
[![Stage](https://img.shields.io/badge/Stage-v0.1.0-green.svg)](#-開發進度-roadmap)

SuperNova 是一個專為長期任務設計的 **AI Runtime (執行時)**。它運行於 **Bun** 高性能環境，旨在探索如何讓 AI Agent 在處理複雜、跨領域且具備長期目標的任務時，透過架構上的解耦與事件驅動來解決 **Context Drift (上下文漂移)** 與 **Goal Drift (目標偏移)** 問題。

> **快速掌握架構**：請優先閱讀 [docs/ARCH.md](docs/ARCH.md) 以獲取最新的系統設計藍圖、通訊協議與角色分工詳情。

## 🌟 核心架構亮點 (Key Features)

*   **三層 Agent 體系**：
    *   `MainAgent`：全局統籌與大腦，擁有上帝視角，負責拆解總體目標。
    *   `SubAgent`：負責單一目標的 PDCA 迴圈，完成後即被系統 GC 回收 (隨用隨拋)。
    *   `EmbodiedAgent`：常駐型實體，能動態注入 `Body` (環境 Prompt 與 ActionTools) 並與外部環境 (如 Discord、Shell 甚至遊戲環境) 進行互動。
*   **非同步事件總線 (EventBus) 與排程 (DAGScheduler)**：
    *   全面捨棄同步等待。Agent 規劃出任務 DAG 後即主動掛起休眠，由排程器依賴關係自動流轉與分發，節省 Token 與 CPU。
    *   **高可靠與安全隔離**：EventBus 支援 `sessionId` 會話租戶隔離、異步 Promise 錯誤安全邊界（阻斷 reject 崩潰）、`publishAsync` 並發等待協調，以及支持 Agent 休眠喚醒的宣告式訂閱。
*   **去中心化記憶與工作區 (WorkspaceManager)**：
    *   **原生 Git 整合**：每個 Agent 與 Task 都有專屬的隔離目錄。Oplog (操作日誌) 與程式變更直接存入專屬目錄。解決併發衝突的同時，更提供了實體檔案層級的歷史回滾能力。
*   **資料持久化與 Repository 倉儲模式**：
    *   **儲存解耦**：引入 Repository 模式（`ISessionRepository` / `IDataBlockRepository`），徹底將業務控制面與本機檔案系統解耦。
    *   **高性能 JSONL 與 Agent 隔離**：會話歷史採用 JSON Lines（JSONL）格式，支援常數時間 $O(1)$ 的極速追加寫入；所有對話/事件歷史按 Agent 物理隔離分檔，讀取特定 Agent 歷史時效率極佳。

## ⚡ 為什麼選擇 Bun？ (Why Bun?)

為了支撐 AI Agent 的高頻、長時運行需求，我們選擇 Bun 作為核心 Runtime：
1.  **極致性能**：Bun 的啟動速度與執行效率遠超傳統 Node.js。
2.  **原生支持**：內建原生 TypeScript 支持與高效的 `bun test` 運行器。
3.  **現代化工具鏈**：快速的依賴管理與簡潔的異步處理機制，使系統保持輕量。

---
© 2026 SuperNova Project. 一個專注於系統架構與 AI 協作邏輯的開發實驗。
