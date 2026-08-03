---
title: SuperNova 全局架構
version: 0.1.1
status: APPROVED
last_updated: 2026-08-03
author: Antigravity & User
related_codes: []
related_docs:
  - ./doc_standards.md
  - ./architecture_principles.md
---

# SuperNova 全局架構 (Global Architecture)

本文件是 SuperNova 系統的架構入口點。基於「非同步並發、事件驅動」的設計哲學，我們將系統依據職責劃分為不同的核心組件。

*   [系統文件規範 (`docs/doc_standards.md`)](./doc_standards.md)：定義 SuperNova 專案所有 Markdown 文件的目錄結構與統一 YAML Frontmatter 標頭規範。

詳細的組件設計與規格，請參閱各子文件：

## 1. 代理層與執行層 (Agent & Execution Layer)
*   [Agent 系統設計 (docs/architecture/agent/agent.md)](./architecture/agent/agent.md)：引入**雙腦意識架構 (Dual-Brain Consciousness)**。包含 `MainAgent` 作為具備動態情緒引擎 (Emotion Engine) 與注意力分配器的情感感知中樞，以及 `TaskAgent` 作為專注 IDE 邏輯與任務執行的左腦，和 `EmbodiedAgent` 作為專注 3D 空間與 CLI 操作的右腦。包含 `BaseAgent` 基礎設施、**PromptSectionIndex 大一統渲染機制** 與生命週期管理。
*   [工具系統設計 (`docs/architecture/agent/tool.md`)](./architecture/agent/tool.md)：定義 `BaseTool` 抽象基底、強型別參數驗證 (Zod) 與執行上下文 (ToolContext) 的沙盒隔離與**工具執行透明化追蹤機制**。

## 2. 調度與事件層 (Scheduling & Event Layer)
*   [EventBus (`docs/architecture/core/event_bus.md`)](./architecture/core/event_bus.md)：包含 `EventBus` (會話安全隔離、publishAsync 異步等待與宣告式訂閱)、**事件分類規範** (SystemEvent、HookEvent、AgentEvent)。
    *   **解耦神經網絡設計**：透過 `WorldUpdated` 事件將外界物理狀態寫入右腦記憶，並由 Package 邊緣運算層負責解析，主動發送 `EmotionTriggered` 神經衝擊訊號，觸發中樞 `MainAgent` 的情緒波動 (Amygdala Hijack 杏仁核劫持機制)。

## 3. 狀態與記憶層 (State & Memory Layer)
*   [記憶與狀態管理 (docs/architecture/core/memory.md)](./architecture/core/memory.md)：包含 `DataBlock` (資料載體)、`InboxBuffer` (收件箱)、`ContextManager` (Oplog 日誌)、`WorkspaceManager` (工作空間控制面，Session 獨占與多驅動擴充)，以及系統安全熔斷機制 (Circuit Breaker)。支援 `DataPointer` 大資料卸載與延遲加載機制，並已整合增量快取與獨立提取的泛型 `LRUCache` 以確保極致效能與記憶體安全。
*   [圖譜記憶 (docs/architecture/memory/graph_memory.md)](./architecture/memory/graph_memory.md)：圖向量混合長期記憶架構 (Hybrid Graph-Vector Memory)。定義 `GraphNode` 實體與帶有情緒權重的 `GraphEdge` 邏輯關聯，並透過 `IGraphRepository` 實現底層解耦。
*   [會話與工作階段管理 (`docs/architecture/core/session.md`)](./architecture/core/session.md)：定義 `Session` 與 `Thread` 的生命週期狀態機。負責全局訊息派發 (`SessionManager.dispatchInboxForAgent`)，透過監聽 `AgentStateChanged` 事件主動釋放積壓訊息，解決 Inbox 餓死 (Starvation) 問題。已重構升級為 **「統一喚醒 (Unified Wakeup)」** 機制，消除發送者分流造成的意識分裂，使 Agent 能在單次思考中總攬全局多方訊息，並引入 **「會話廣播 (Broadcast)」** 與工具私訊的分層回覆架構。支援基於 `ISessionRepository` 等儲存庫的持久化。

## 4. 系統基礎建設與安全 (Infrastructure & Security)
*   [基礎建設與配置 (`docs/architecture/core/base.md`)](./architecture/core/base.md)：包含配置管理、**Kernel (依賴注入中樞，統一宣告與派發 Repositories)**、系統日誌與監控 (Telemetry)、儲存層抽象 (Storage) 以及外掛註冊機制 (Registry)。
*   [零信任安全架構 (`docs/architecture/core/security.md`)](./architecture/core/security.md)：定義防止 Prompt 注入、與高危操作的人工審批 (HITL) 權限閘道。

---

## 5. 綜合模擬場景 (Scenarios)
*   [Minecraft 具身智能沙盒 (`docs/examples/scenario_minecraft_embodied.md`)](./examples/scenario_minecraft_embodied.md)：展示 `EmbodiedAgent` 如何與外部環境 (mineflayer) 透過 EventBus 與 DataBlock 解耦雙向通訊。同時遵循 **物理世界優先 (Physical World First)** 原則，確保外部軀殼實體連線且就緒 (spawned) 後，系統才能開始介入調度。

---

## 6. 目錄架構與依賴邊界 (Directory Structure & Boundaries)
系統程式碼嚴格劃分基礎設施與業務邏輯的邊界：
*   **`src/core/` (核心與基礎設施層)**：包含底層通用組件與內核骨架（如 `EventBus`、`DataBlock`、`LogManager`、以及核心的 `BaseAgent`、`MainAgent`、`TaskAgent`、`EmbodiedAgent` 等大腦實體，還有負責統籌的 `AgentManager`）。`core` 目錄下的所有對外公開模組已統一透過 `src/core/index.ts` 匯出 (Export Boundary)。
*   **`src/package/` (業務擴充與外掛層)**：包含特定領域的延伸應用與自訂邏輯。業務邏輯層**必須**透過 `src/core/index.ts` 引用內核與核心大腦，嚴禁繞過 index 進行深層耦合。