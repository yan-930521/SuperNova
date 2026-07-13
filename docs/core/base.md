# 系統基礎建設 (System Infrastructure)

本文件依據 codebase 中 `./src/core` 與 `./src/config` 的現有架構實作，定義了 SuperNova 系統運行的底層基礎設施。這些設施為上層的 Agent 與排程器提供了生命週期管理、依賴注入、配置管理與觀測能力。

## 1. 配置管理 (Configuration - `src/config/`)
系統的配置管理實作了強型別與動態載入機制，集中管理環境變數與系統參數：
*   **`Config.ts` & `DefaultConfig.ts`**：定義系統全域設定的介面與出廠預設值。
*   **`ConfigLoader.ts`**：負責從環境變數或外部設定檔加載並覆寫預設配置，確保系統在不同環境（Development / Production）下的行為一致性。

## 2. 依賴注入容器 (DI Container - `src/core/container/`)
*   **`ComponentContainer.ts`**：實作了控制反轉 (IoC) 的依賴注入容器。
    *   **職責**：負責註冊、解析並管理系統中各個核心單例組件（如 `LogManager`, `EventBus`），徹底解除組件間的硬編碼耦合。
    *   **擴展性**：這是未來實作 `EmbodiedAgent` 動態注入不同 `Body` 與 `ActionTools` 模組的最底層依據。

## 3. 生命週期管理 (Lifecycle - `src/core/lifecycle/`)
*   **`ILifecycle.ts`**：定義了統一的生命週期介面。
    *   **規範**：任何長期運行或持有資源的核心服務（如 EventBus、DAGScheduler 或資料庫連線池），都必須實作此介面的方法（例如 `init()`, `start()`, `stop()`）。
    *   這使得系統啟動時可以確保依賴順序，並在關閉時執行優雅停機 (Graceful Shutdown)。

## 4. 基礎設施與可觀測性 (Infra & Telemetry - `src/core/infra/`)
*   **日誌管理 (`LogManager.ts` & `transports/`)**：
    *   **雙軌日誌架構 (Global vs Contextual)**：
        1. **`LogManager.recorder` (Static Global)**：全域共用的系統預設 Recorder，專供底層基礎設施 (如 EventBus, WorkspaceManager) 發生「共用層級錯誤」時使用，避免直接 throw 導致進程崩潰。
        2. **上下文綁定 (Contextual Logger)**：每個 Agent 在初始化時會獲得專屬的 `LogManager` 實例，預先注入 `agent_id` 等上下文，精確追蹤來源。
    *   **Oplog 即 Transport (架構收斂)**：系統廢棄了獨立的 `IOplogStorage` 介面。Oplog 本質上只是 `LogManager` 的一種 Transport 實作。
    *   **控制反轉 (IoC) 的路徑管理**：拋棄了複雜的 `WorkspaceOplogTransport`。底層只保留純粹寫檔的 `FileTransport`，而 Agent 日誌（Oplog）的儲存路徑，統一由 `BaseAgent` 根據 `Config`（如 `agents_workspace_dir`）動態組合並注入，完美解耦了業務邏輯與底層 I/O。
    *   *(依據開發規範：系統層級日誌內容強制使用英文，以利後續與外部監控系統整合。)*
*   **全局 ID 生成器 (`IdGenerator.ts`)**：
    *   **語義化前綴 (Semantic Prefixes)**：為了在 Oplog 與除錯時具備極高的辨識度，系統揚棄了純 UUID，所有實體 ID 必須帶有語義前綴。例如：`block_3c7a` (DataBlock)、`agt_sub_64af` (SubAgent)、`wkr_f8e7` (Worker)。
*   **持久化儲存 (`persistence/`)**：
    *   底層儲存與工作區抽象目錄。集中管理 `WorkspaceManager` (工作區隔離) 與 `InboxBuffer` 快取的儲存介面，隱藏具體資料庫與實體檔案系統的實作細節。

---

## 5. 開發規範 (Development Guidelines)
*   **基礎設施錯誤處理 (Error Handling 分級制)**：
    *   **共用層級錯誤 (Shared Infra Errors)**：若錯誤發生在全局共用的基礎設施（例如：全域 `EventBus` 網路斷線、資料庫連線池崩潰），不應粗暴地 throw 導致進程崩潰，而是必須呼叫「**系統預設 Recorder (Global LogManager)**」記錄為 System Alert，交由系統監控模組統一處理。
    *   **任務層級錯誤 (Contextual/Task Errors)**：若錯誤屬於特定 Agent 或 Task 的執行流（例如：`WorkspaceManager` 建立特定分支失敗、處理特定的 `DataBlock` 格式錯誤），**絕對禁止**底層默默使用 `console.warn` 吞没錯誤。此時必須**直接 `throw` 例外**，將控制權精準拋還給發起呼叫的 Agent。這確保了 Agent 能在專屬的 Oplog 中捕獲該錯誤，及時觸發 `[ACT]` 階段進行決策修正。
