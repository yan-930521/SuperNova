---
title: 系統基礎建設
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes:
  - ../../../src/core/lifecycle/RuntimeKernel.ts
  - ../../../src/core/lifecycle/ILifecycle.ts
  - ../../../src/core/container/ComponentContainer.ts
  - ../../../src/core/config/Config.ts
  - ../../../src/core/config/ConfigLoader.ts
  - ../../../src/core/config/DefaultConfig.ts
  - ../../../src/core/infra/LogManager.ts
  - ../../../src/core/utils/PromptLoader.ts
  - ../../../src/core/utils/GraphValidator.ts
  - ../../../src/core/utils/IdGenerator.ts
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
---

# 系統基礎建設 (System Infrastructure)

本文件依據 codebase 中 `./src/core` 的現有架構實作，定義了 SuperNova 系統運行的底層基礎設施。這些設施為上層的 Agent 與排程器提供了生命週期管理、依賴注入、配置管理與觀測能力。

## 1. 配置管理 (Configuration - `src/core/config/`)
系統的配置管理實作了強型別與動態載入機制，集中管理環境變數與系統參數：
*   **`Config.ts` & `DefaultConfig.ts`**：定義系統全域設定的介面與出廠預設值。
*   **`ConfigLoader.ts`**：負責從環境變數或外部設定檔加載並覆寫預設配置，確保系統在不同環境（Development / Production）下的行為一致性。

## 2. 依賴注入容器 (DI Container - `src/core/container/`)
*   **`ComponentContainer.ts`**：實作了控制反轉 (IoC) 的依賴注入容器。
    *   **職責**：負責註冊、解析並管理系統中各個核心單例組件（如 `LogManager`, `EventBus` 等），徹底解除組件間的硬編碼耦合。
    *   **擴展性**：這是未來實作 `EmbodiedAgent` 動態注入不同 `Body` 與 `ActionTools` 模組的最底層依據。

## 3. 生命週期管理 (Lifecycle - `src/core/lifecycle/`)

系統引進了統一的生命週期管理機制，以確保多組件在高並發運行時的穩定引導與安全退出。

### 3.1. 生命週期介面 (`ILifecycle.ts`)
任何長期運行或持有資源的核心管理器（如 EventBus、AgentManager 等），都必須實作 `ILifecycle` 介面：
*   `init()`: 分配基本資源、注入依賴（IoC Container）。
*   `start()`: 啟動非同步監聽、建立連線、開始排程。
*   `stop()`: 停止新請求、持久化狀態、優雅釋放資源。

### 3.2. 核心系統框架拓撲 (Kernel DI Topology)
SuperNova Runtime Kernel (運行時內核) 作為全局依賴注入 (DI) 的中樞，負責實例化底層儲存庫與協調管理核心管理器。

**底層 Repository (資料倉儲) 統一宣告**
在 Kernel 初始化階段，系統會依據環境配置，動態宣告並建立所有底層持久化倉儲。這完全解除了 Manager 對實體儲存引擎的耦合：
*   `ISessionRepository` (e.g., `FileSystemSessionRepository`)
*   `IDataBlockRepository` (e.g., `FileSystemDataBlockRepository`)
*   `IAgentStateRepository` (e.g., `FileSystemAgentStateRepository`)
*   `IGraphRepository` (e.g., `JsonGraphRepository`)

**Manager 依賴注入與協調**
Kernel 將上述生成的 Repositories 透過建構子或 DI 容器，派發並注入至核心管理器（Managers）：
1.  **EventBus**：通訊神經系統，負責跨 Session 的非同步事件路由與訂閱。
2.  **WorkspaceManager**：依據工作區類型動態分配 StorageDriver (VFS/Git) 以處理檔案操作。
3.  **AgentManager**：接收 `IAgentStateRepository` 與 `WorkspaceManager` 等，負責所有 Agent 狀態管理與生命週期。
4.  **SessionManager**：接收 `ISessionRepository` 與 `WorkspaceManager` 等，負責管理會話，統一攔截與派發 AgentMessage。

*(註：`MemoryManager`, `LLMProvider` 亦在 Kernel 中初始化並註冊至 DI 容器。)*

### 3.3. 系統引導啟動順序 (Bootstrap Sequence)
當 `Kernel.start()` 被呼叫時，系統進行以下引導流程：
1.  **IoC 容器啟動**：呼叫 `container.boot()`，依照註冊順序由底向高依序調用各組件的 `initialize()` 與 `start()` 方法 (例如 EventBus -> WorkspaceManager -> SessionManager 等)。
2.  **註冊作業系統信號監聽**：設置 `SIGINT` 與 `SIGTERM` 監聽。
3.  **啟動系統心跳引擎 (Tick Engine)**：每 1 秒發布一次 `SystemEvent.Tick` 事件。

### 3.4. 優雅停機順序 (Graceful Shutdown Sequence)
當系統捕獲 `SIGINT` 或 `SIGTERM` 停機信號時， `Kernel.stop()` 被呼叫，進行優雅關閉流程：
1.  **停止系統心跳**：清除 Tick Timer。
2.  **註銷信號監聽**：避免重複觸發。
3.  **IoC 容器停機**：呼叫 `container.shutdown()`，以「註冊順序的相反順序」依序調用所有組件的 `stop()`，先凍結高階邏輯與狀態（如 SessionManager），再關閉底層儲存（如 WorkspaceManager），最後關閉底層通信（如 EventBus）。

## 4. 基礎設施與工具類 (Infrastructure & Utilities)
*   **日誌管理 (`LogManager.ts` & `transports/`)**：
    *   **雙軌日誌架構 (Global vs Contextual)**：
        1. **`LogManager.recorder` (Static Global)**：全域共用的系統預設 Recorder，專供底層基礎設施 (如 EventBus) 發生「共用層級錯誤」時使用，避免直接 throw 導致進程崩潰。
        2. **上下文綁定 (Contextual Logger)**：每個 Agent 在初始化時會獲得專屬的 `LogManager` 實例，預先注入 `agent_id` 等上下文，精確追蹤來源。
    *   **`ConsoleTransport` (`transports/ConsoleTransport.ts`)**：提供日誌的終端機輸出傳輸層實作。
    *   **Oplog 即 Transport**：Oplog 本質上是 `LogManager` 的一種 Transport 實作。
    *   **控制反轉 (IoC) 的路徑管理**：底層僅保留純粹寫檔的 `FileTransport`。Agent 內部的運行日誌與 Oplog，統一由 `BaseAgent` 配置寫入專屬的實體日誌目錄，完全與具體儲存解耦。
*   **全局 ID 生成器 (`IdGenerator.ts`)**：提供全系統唯一標識符的生成功能。
*   **Prompt 載入器 (`PromptLoader.ts`)**：提供具備 LRU 快取、錯誤處理與回退機制的 Prompt 模板讀取功能。
*   **圖形驗證器 (`GraphValidator.ts`)**：提供純函數邏輯，用於偵測任務圖或規劃草案中的物理邏輯錯誤（如循環依賴、孤立節點等）。
*   **快取基礎設施 (`LRUCache.ts`)**：提供泛用的 Least Recently Used 快取機制。支援自訂 `capacity` 上限，並具備強大的 `onEvict` 生命週期回呼函數 (Callback)，確保在資源被逐出快取時能執行清理與優雅關閉動作（如關閉內部迴圈、釋放記憶體），避免資源洩漏。

---

## 5. 開發規範 (Development Guidelines)
*   **基礎設施錯誤處理 (Error Handling 分級制)**：
    *   **共用層級錯誤 (Shared Infra Errors)**：若錯誤發生在全局共用的基礎設施（例如：全域 `EventBus` 網路斷線），不應粗暴地 throw 導致進程崩潰，而是必須呼叫「**系統預設 Recorder (Global LogManager)**」記錄，交由系統監控模組統一處理。
    *   **任務層級錯誤 (Contextual/Task Errors)**：若錯誤屬於特定 Agent 或 Task 的執行流，**絕對禁止**底層默默使用 `console.warn` 吞没錯誤。此時必須**直接 `throw` 例外**，將控制權精準拋還給發起呼叫的 Agent。這確保了 Agent 能在專屬的 Oplog 中捕獲該錯誤，及時觸發 `[ACT]` 階段進行決策修正。

> 進階功能規劃（HITLGateway、WorkspaceManager、Telemetry、Plugin Registry）請參閱 [基礎建設進階規劃](../../todo/infra_advanced.md)。
