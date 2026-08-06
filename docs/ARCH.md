---
title: SuperNova 全局架構
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes:
  - ../src/core/index.ts
related_docs:
  - ./doc_standards.md
  - ./architecture_principles.md
---

# SuperNova 全局架構 (Global Architecture)

本文件是 SuperNova 系統的架構入口點。基於「非同步並發、事件驅動」的設計哲學，我們將系統依據職責劃分為不同的核心組件。

*   [系統文件規範 (`docs/doc_standards.md`)](./doc_standards.md)：定義 SuperNova 專案所有 Markdown 文件的目錄結構與統一 YAML Frontmatter 標頭規範。

詳細的組件設計與規格，請參閱各子文件：

## 1. 代理層與執行層 (Agent & Execution Layer)
*   [Agent 系統設計 (docs/architecture/agent/agent.md)](./architecture/agent/agent.md)：引入**雙腦意識架構 (Dual-Brain Consciousness)**。包含 `MainAgent` 作為具備 OCC 情緒引擎 (Emotion Engine) 的情感感知中樞，以及 `TaskAgent` 作為專注 IDE 邏輯與任務執行的左腦，和 `EmbodiedAgent` 作為專注 3D 空間與 CLI 操作的右腦。包含 `BaseAgent` 基礎設施、**PromptSectionIndex 渲染機制**、意識投影 (Consciousness Projection)、時間感知插針 (Temporal Injection) 與生命週期管理。
*   [工具系統設計 (`docs/architecture/agent/tool.md`)](./architecture/agent/tool.md)：定義 `BaseTool` 抽象基底、強型別參數驗證 (Zod) 與執行上下文 (ToolContext)。包含內建工具列表 (`SendMessageTool`, `ToggleProjectionTool`, `ReadBlobTool`, `ReadFileTool`, `WriteFileTool`, `ListFilesTool`, `RunBashTool`)，以及「工具負責做事，大腦負責記憶與廣播」的職責分離機制。

## 2. 調度與事件層 (Scheduling & Event Layer)
*   [EventBus (`docs/architecture/core/event_bus.md`)](./architecture/core/event_bus.md)：包含 `EventBus` (會話安全隔離、publishAsync 異步等待與宣告式訂閱)、**事件分類規範** (SystemEvent、HookEvent、AgentEvent)、`GlobalEventMap` 泛型推導與 `DataPointer` 資料指標機制。

## 3. 狀態與記憶層 (State & Memory Layer)
*   [記憶與狀態管理 (docs/architecture/core/memory.md)](./architecture/core/memory.md)：包含 `DataBlock` (資料載體、雙軸語意編碼、Claim Check Pattern)、透過 `SessionManager` 實現的收件箱機制、透過 `IDataBlockRepository` 實現的歷史紀錄管理，以及系統安全熔斷機制 (Circuit Breaker)。支援 `DataPointer` 大資料卸載與延遲加載機制，並已整合泛型 `LRUCache` 以確保效能與記憶體安全。具備時間感知插針 (Temporal Injection)、換日總結 (Daily Summary) 與防打斷延遲 (Debounce) 機制。
*   [圖譜記憶 (docs/architecture/memory/graph_memory.md)](./architecture/memory/graph_memory.md)：圖譜長期記憶架構。定義 `MemoryNode` 實體與 `MemoryEdge` 關聯。透過 `MemoryManager` 在背景依據閾值自動觸發三元組萃取，並支援 Feature Flags 開關 (`enable_graph_memory`, `enable_daily_summary`) 與多代理人 (Multi-Agent) 遍歷處理。具備防重入保護與 Tick 驅動的換日最佳化邏輯。
*   [會話與工作階段管理 (`docs/architecture/core/session.md`)](./architecture/core/session.md)：定義 `Session` 與 `Thread` 的生命週期狀態機。負責全局訊息派發 (`SessionManager.dispatchInboxForAgent`)，透過監聽 `AgentStateChanged` 事件主動釋放積壓訊息。已實現 **「統一喚醒 (Unified Wakeup)」** 機制與 **「會話廣播 (Broadcast)」** 分層回覆架構。支援基於 `ISessionRepository`、`IDataBlockRepository`、`IAgentStateRepository` 等儲存庫的持久化。

## 4. 系統基礎建設 (Infrastructure)
*   [基礎建設與配置 (`docs/architecture/core/base.md`)](./architecture/core/base.md)：包含配置管理 (`Config`, `ConfigLoader`, `DefaultConfig`)、**RuntimeKernel (依賴注入中樞)**、`ComponentContainer` (IoC 容器)、`ILifecycle` 生命週期介面、系統日誌 (`LogManager` 雙軌架構)、持久化儲存 (`IRepository`, `JsonFileRepository`)、WorkspaceManager (雙層工作區拓撲與 StorageDriver 動態配置)，以及工具類別 (`PromptLoader`, `GraphValidator`, `IdGenerator`)。

---

## 5. 綜合模擬場景 (Scenarios)
*   [Minecraft 具身智能沙盒 (`docs/examples/scenario_minecraft_embodied.md`)](./examples/scenario_minecraft_embodied.md)：展示 `EmbodiedAgent` 如何與外部環境 (mineflayer) 透過 `BotManager` 與 EventBus 解耦雙向通訊。遵循 **物理世界優先 (Physical World First)** 原則，包含 `CommandRouter` 指令路由系統與內建指令 (`ObserveCommand`, `MoveCommand`, `ChatCommand`)。

---

## 6. 目錄架構與依賴邊界 (Directory Structure & Boundaries)
系統程式碼嚴格劃分基礎設施與業務邏輯的邊界：
*   **`src/core/` (核心與基礎設施層)**：包含底層通用組件與內核骨架（如 `EventBus`、`DataBlock`、`LogManager`、以及核心的 `BaseAgent`、`MainAgent`、`TaskAgent`、`EmbodiedAgent` 等大腦實體，還有負責統籌的 `AgentManager`）。`core` 目錄下的所有對外公開模組已統一透過 `src/core/index.ts` 匯出 (Export Boundary)。
*   **`src/package/` (業務擴充與外掛層)**：包含特定領域的延伸應用與自訂邏輯（如 `underworld` Minecraft 整合）。業務邏輯層**必須**透過 `src/core/index.ts` 引用內核與核心大腦，嚴禁繞過 index 進行深層耦合。

---

## 7. 未實現功能規劃 (Planned Features)
以下功能已完成設計但尚未實現，詳細規劃請參閱 [`docs/todo/`](./todo/) 目錄：

| 規劃文件 | 概述 |
| :--- | :--- |
| [零信任安全架構](./todo/security.md) | Prompt 注入防護、HITL 權限閘道 |
| [Agent 進階功能](./todo/agent_advanced.md) | PDCA 交互流程、高階擴展模型、跨會話事件訂閱 |
| [工具系統進階](./todo/tool_advanced.md) | 沙盒隔離、工具權限控制、重試機制、環境動作工具 |
| [EventBus 進階](./todo/event_bus_advanced.md) | TTL 監控、工具 API、事件優先級/重播/背壓 |
| [工作空間進階設計](./todo/workspace.md) | 工作區 GC 與存檔策略、跨工作區共享協同 |
| [會話進階功能](./todo/session_advanced.md) | HITL 閘道、Thread 分支合併、VFS GC、會話重播 |
| [基礎建設進階](./todo/infra_advanced.md) | HITLGateway、Telemetry、Plugin Registry |
| [圖譜記憶進階](./todo/graph_memory_advanced.md) | 向量嵌入、進階圖譜查詢、情緒權重動態調整 |
| [Underworld 社會模擬](./todo/underworld_society.md) | 天職系統、禁忌目錄、多角色生態鏈 |