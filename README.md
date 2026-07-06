# SuperNova: A Persistent Multi-Agent Runtime for Autonomous Coordination

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#-核心設計-集中編排架構)
[![Stage](https://img.shields.io/badge/Stage-v0.6.0-green.svg)](#-開發進度-roadmap)

SuperNova 是一個專為長期任務設計的 **AI Runtime (執行時)**。它運行於 **Bun** 高性能環境，旨在探索如何讓 AI Agent 在處理複雜、跨領域且具備長期目標的任務時，透過架構上的解耦與事件驅動來解決 **Context Drift (上下文漂移)** 與 **Goal Drift (目標偏移)** 問題。

> **快速掌握架構**：請優先閱讀 [docs/ARCH.md](docs/ARCH.md) 以獲取最新的系統設計藍圖、通訊協議與角色分工詳情。

## ⚡ 為什麼選擇 Bun？ (Why Bun?)

為了支撐 AI Agent 的高頻、長時運行需求，我們選擇 Bun 作為核心 Runtime：
1.  **極致性能**：Bun 的啟動速度與執行效率遠超傳統 Node.js。
2.  **原生支持**：內建原生 TypeScript 支持與高效的 `bun test` 運行器。
3.  **現代化工具鏈**：快速的依賴管理與簡潔的異步處理機制，使系統保持輕量。

## 🏗️ 核心設計：v0.6.0 集中編排架構

SuperNova 的 Runtime 核心在 v0.6.0 進行了大幅進化，從分散的調度轉向以 **SupervisorAgent** 為中樞的事件流：

### 1. 集中化事件編排 (Centralized Orchestration)
將所有的任務流轉、階段轉場 (Transition) 與併發調度 (Tick) 邏輯全部收斂至 **SupervisorAgent (SA)**。SA 成為系統的決策中樞，透過監聽通用的 `Phase` 事件 (Start/Finish/Fail) 驅動整個蜂群。

### 2. 標準化通訊協議 (Standardized Protocol)
- **通用 Payload**：統一使用 `content` 欄位承載核心內容，移除欄位歧義。
- **通配符訂閱**：`EventBus` 支援 `*` 通配符，允許監控腳本或背景代理觀察全域事件。
- **OpenAI Strict Mode 相容**：所有工具 Schema (Zod) 皆經過優化，完全符合 OpenAI 嚴格模式的要求。

### 3. 三層記憶體與知識甄別
- **L1 Blackboard (黑板)**：存放即時變數與跨 Agent 交接指針。
- **L2 Fact (事實)**：由 `ActingAgent` 進行知識甄別，僅保留具備長效價值的經驗。
- **L3 SOP (操作手冊)**：將成功的執行路徑沉澱為可複用的標準作業程序。

## 🤖 PDCA 代理角色分工 (v0.6.0)

- **Supervisor (中樞)**：負責路由決策、任務生命週期管理與子任務調度。
- **Planning (規劃)**：執行分形拆解，產出結構化的任務圖。
- **Doing (執行)**：利用 **LangChain v1.0 (createAgent)** 進行自律工具呼叫。
- **Checking (審核)**：**升級為自主審核者**。具備工具輔助的實證能力，先進行深度驗證再收斂至結構化決策。
- **Acting (改善)**：負責經驗沉澱，區分暫時性數據與可複用知識。

---
© 2026 SuperNova Project. 一個專注於系統架構與 AI 協作邏輯的開發實驗。
