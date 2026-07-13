# SuperNova 全局架構 (Global Architecture)

本文件是 SuperNova 系統的架構入口點。基於「非同步並發、事件驅動」的設計哲學，我們將系統依據職責劃分為不同的核心組件。

詳細的組件設計與規格，請參閱各子文件：

## 1. 代理層與執行層 (Agent & Execution Layer)
*   [Agent 系統設計 (`docs/agent/agent.md`)](./agent/agent.md)：包含 `MainAgent` 與 `SubAgent` 的職責、PDCA 循環資料流，以及驅動 Agent 的 Prompt 指令集規範。
*   [Worker 執行單元 (`docs/agent/worker.md`)](./agent/worker.md)：定義無狀態原子執行單元的行為模式。
*   [Task 任務系統 (`docs/agent/task.md`)](./agent/task.md)：定義系統最小排程單位 `Task` 的資料結構，包含計畫、進度、評測標準與排程控制。

## 2. 調度與事件層 (Scheduling & Event Layer)
*   [EventBus 與排程器 (`docs/core/event_bus.md`)](./core/event_bus.md)：包含 `EventBus` (事件路由與中斷喚醒)、`DAGScheduler` (任務依賴解析與 TTL 監控)，以及底層提供給 Agent 的系統工具 API 邊界。

## 3. 狀態與記憶層 (State & Memory Layer)
*   [記憶與狀態管理 (`docs/core/memory.md`)](./core/memory.md)：包含 `DataBlock` (通用訊息載體)、`InboxBuffer` (收件箱)、`ContextManager` (Oplog 日誌)、`WorkspaceManager` (基於 Git 的目錄隔離)，以及系統安全熔斷機制 (Circuit Breaker)。

## 4. 系統基礎建設與安全 (Infrastructure & Security)
*   [基礎建設與配置 (`docs/core/base.md`)](./core/base.md)：包含配置管理、系統日誌與監控 (Telemetry)、儲存層抽象 (Storage) 以及外掛註冊機制 (Registry)。
*   [零信任安全架構 (`docs/core/security.md`)](./core/security.md)：定義防止 Prompt 注入、Worker 隔離沙盒與高危操作的人工審批 (HITL) 權限閘道。

---

## 5. 綜合模擬場景 (Scenarios)
*   [HackerNews 抓取與 Discord 轉發 (`docs/examples/scenario_hn_discord.md`)](./examples/scenario_hn_discord.md)：透過具體案例展示 MainAgent、SubAgent、EmbodiedAgent、Worker 與 EventBus 的完整協同資料流。