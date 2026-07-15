---
title: SuperNova 全局架構
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes: []
related_docs:
  - ./doc_standards.md
  - ./architecture_principles.md
---

# SuperNova 全局架構 (Global Architecture)

本文件是 SuperNova 系統的架構入口點。基於「非同步並發、事件驅動」的設計哲學，我們將系統依據職責劃分為不同的核心組件。

*   [系統設計與需求說明書 (`docs/sdd.md`)](./sdd.md)：合併並提煉了全系統的需求分析（SRS）與系統設計（SDD），是全專案開發的總體規範。
*   [系統文件規範 (`docs/doc_standards.md`)](./doc_standards.md)：定義 SuperNova 專案所有 Markdown 文件的目錄結構與統一 YAML Frontmatter 標頭規範。

詳細的組件設計與規格，請參閱各子文件：

## 1. 代理層與執行層 (Agent & Execution Layer)
*   [Agent 系統設計 (docs/architecture/agent/agent.md)](./architecture/agent/agent.md)：包含 `BaseAgent` 的生命週期管理、`SubAgent` 的持久化休眠與 ID 召回機制、PDCA 循環資料流，以及跨會話事件訂閱與動態喚醒機制。
*   [Worker 執行單元 (`docs/architecture/agent/worker.md`)](./architecture/agent/worker.md)：定義無狀態原子執行單元的行為模式。
*   [Task 任務系統 (`docs/architecture/agent/task.md`)](./architecture/agent/task.md)：定義系統最小排程與執行單位 `Task` 及拓撲結構 `TaskDAG` 的資料模型，包含排程控制、去硬編碼配置與 `DataBlock` 資料流。

## 2. 調度與事件層 (Scheduling & Event Layer)
*   [EventBus 與排程器 (`docs/core/event_bus.md`)](./core/event_bus.md)：包含 `EventBus` (會話安全隔離、publishAsync 異步等待與宣告式訂閱)、`DAGScheduler` (任務依賴解析與 TTL 監控)，以及底層提供給 Agent 的系統工具 API 邊界。

## 3. 狀態與記憶層 (State & Memory Layer)
*   [記憶與狀態管理 (docs/architecture/core/memory.md)](./architecture/core/memory.md)：包含 `DataBlock` (資料載體)、`InboxBuffer` (收件箱)、`ContextManager` (Oplog 日誌)、`WorkspaceManager` (工作空間控制面，Session 獨佔且多驅動擴充)，以及系統安全熔斷機制 (Circuit Breaker)。
*   [會話與工作階段管理 (`docs/core/session.md`)](./core/session.md)：定義 `Session` 與 `Thread` 的生命週期狀態機、基於 `ISessionRepository` 與 `IDataBlockRepository` (JSONL/Agent 隔離) 的持久化儲存、時空旅行重播與人機協同審批閘道。

## 4. 系統基礎建設與安全 (Infrastructure & Security)
*   [基礎建設與配置 (`docs/core/base.md`)](./core/base.md)：包含配置管理、系統日誌與監控 (Telemetry)、儲存層抽象 (Storage) 以及外掛註冊機制 (Registry)。
*   [零信任安全架構 (`docs/core/security.md`)](./core/security.md)：定義防止 Prompt 注入、Worker 隔離沙盒與高危操作的人工審批 (HITL) 權限閘道。

---

## 5. 綜合模擬場景 (Scenarios)
*   [HackerNews 抓取與 Discord 轉發 (`docs/examples/scenario_hn_discord.md`)](./examples/scenario_hn_discord.md)：透過具體案例展示 MainAgent、SubAgent、EmbodiedAgent、Worker 與 EventBus 的完整協同資料流。

---

## 6. 目錄架構與依賴邊界 (Directory Structure & Boundaries)
系統程式碼嚴格劃分基礎設施與業務邏輯的邊界：
*   **`src/core/` (基礎設施層)**：包含底層通用組件如 `EventBus`、`DataBlock`、`LogManager` 等。`core` 目錄下的所有對外公開模組已統一透過 `src/core/index.ts` 匯出 (Export Boundary)。
*   **`src/package/` (業務邏輯層)**：包含**所有 Agent 相關的程式碼** (包含抽象的 `BaseAgent` 以及具體的 `SubAgent`、`MainAgent` 等)。業務邏輯層**必須**透過 `src/core/index.ts` 引用底層基礎設施，嚴禁繞過 index 進行深層耦合。