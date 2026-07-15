---
title: 系統基礎建設
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes: []
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
    *   **職責**：負責註冊、解析並管理系統中各個核心單例組件（如 `LogManager`, `EventBus`），徹底解除組件間的硬編碼耦合。
    *   **擴展性**：這是未來實作 `EmbodiedAgent` 動態注入不同 `Body` 與 `ActionTools` 模組的最底層依據。

## 3. 生命週期管理 (Lifecycle - `src/core/lifecycle/`)

系統引進了統一的生命週期管理機制，以確保多組件在高並發運行時的穩定引導與安全退出。

### 3.1. 生命週期介面 (`ILifecycle.ts`)
任何長期運行或持有資源的核心管理器（如 EventBus、WorkspaceManager、AgentManager 等），都必須實作 `ILifecycle` 介面：
*   `init()`: 分配基本資源、注入依賴（IoC Container）。
*   `start()`: 啟動非同步監聽、建立連線、開始排程。
*   `stop()`: 停止新請求、持久化狀態、優雅釋放資源。

### 3.2. 核心系統框架拓撲
SuperNova Runtime Kernel (運行時內核) 負責協調並管理以下六大管理器（Managers）：
1.  **EventBus**：通訊神經系統，負責跨 Session 的非同步事件路由與訂閱。
2.  **WorkspaceManager**：工作區控制面，與儲存介質解耦，暴露 `readFile/writeFile/runBash` 介面。
3.  **AgentManager**：管理 Agent 活躍與休眠（Dehydrate/Rehydrate）狀態。
4.  **HITLGateway**：人機協同審批閘道，持久化管理審批請求。
5.  **SessionManager**：維護 Session 與 Thread 生命週期，調度工作區與 Agent。

### 3.3. 系統引導啟動順序 (Bootstrap Sequence)
當 `Kernel.start()` 被呼叫時，系統按照「**先打通底層基礎設施（通信與儲存），再加載高階業務邏輯（會話與 Agent）**」的依賴順序，**由底向高**依序調用各組件的生命週期方法：
1.  **EventBus** `start()`: 啟動非同步事件循環監聽。
2.  **WorkspaceManager** `start()`: 驗證工作空間根目錄（VFS/Git）狀態，準備就緒。
3.  **AgentManager** `start()`: 初始化 Agent 狀態持久化資料庫，準備召回引擎。
4.  **HITLGateway** `start()`: 啟用對外人機交互監聽。
5.  **SessionManager** `start()` (*會話自動恢復*):
    *   掃描持久層中狀態為 `ACTIVE` 或 `INTERRUPTED` 的歷史會話。
    *   對未完成的會話，通知 `AgentManager` 透過 ID 召回（Rehydrate）其 `MainAgent`，重組 TaskDAG 狀態以恢復執行，確保系統斷電重啟後的自愈能力。

### 3.4. 優雅停機順序 (Graceful Shutdown Sequence)
當系統捕獲 `SIGINT` 或 `SIGTERM` 停機信號時， `Kernel.stop()` 被呼叫，系統按照「**先凍結高階邏輯與狀態，再關閉底層儲存與通信**」的順序，**由高向底**（與啟動相反）優雅關閉：
1.  **SessionManager** `stop()`: 拒絕新會話建立。將當前所有 `ACTIVE` 的會話狀態變更為 `SUSPENDED`。
2.  **AgentManager** `stop()`: 遍歷所有活躍 Agent，強制執行 `Dehydrate()`（脫水存檔），將其 Context 與 Oplog 寫入磁碟，隨後註銷實例釋放記憶體。
3.  **HITLGateway** `stop()`: 關閉對外審批端口，將所有 `PENDING` 狀態的審批請求安全封存。
4.  **WorkspaceManager** `stop()`: 
    *   對所有開啟的工作區執行自動 Commit（以 `"Graceful Shutdown Auto-Save"` 為訊息）。
    *   卸載工作區目錄，釋放實體檔案鎖，確保工作空間處於乾淨狀態。
5.  **EventBus** `stop()` (*Worker 立即中斷機制*):
    *   停止路由新事件。
    *   **立即中斷處置**：向佇列中正在運行的 Worker 發送 `AbortSignal`（中斷訊號）強制終止其執行，並將其當前對應的 Task 狀態退回 `PENDING`，以便下次重啟時由 `SessionManager` 的恢復流重新指派執行。
    *   等待當前 Worker 資源釋放，關閉事件循環。

## 4. 基礎設施與可觀測性 (Infra & Telemetry - `src/core/infra/`)
*   **日誌管理 (`LogManager.ts` & `transports/`)**：
    *   **雙軌日誌架構 (Global vs Contextual)**：
        1. **`LogManager.recorder` (Static Global)**：全域共用的系統預設 Recorder，專供底層基礎設施 (如 EventBus, WorkspaceManager) 發生「共用層級錯誤」時使用，避免直接 throw 導致進程崩潰。
        2. **上下文綁定 (Contextual Logger)**：每個 Agent 在初始化時會獲得專屬的 `LogManager` 實例，預先注入 `agent_id` 等上下文，精確追蹤來源。
    *   **Oplog 即 Transport**：Oplog 本質上是 `LogManager` 的一種 Transport 實作。
    *   **控制反轉 (IoC) 的路徑管理**：底層僅保留純粹寫檔的 `FileTransport`。Agent 內部的運行日誌與 Oplog，統一由 `BaseAgent` 配置寫入專屬的**實體日誌目錄**（如 `{log_dir}/agents/{agent_id}/`），**完全與 `WorkspaceManager` 解耦**，不再受限於任務虛擬檔案系統或分支狀態。
    *   *(依據開發規範：系統層級日誌內容強制使用英文，以利後續與外部監控系統整合。)*
*   **全局 ID 生成器 (`IdGenerator.ts`)**：
    *   **語義化前綴 (Semantic Prefixes)**：為了在 Oplog 與除錯時具備極高的辨識度，所有實體 ID 均設計為帶有語義前綴。例如：`block_3c7a` (DataBlock)、`agt_sub_64af` (SubAgent)、`wkr_f8e7` (Worker)。
*   **持久化儲存 (`persistence/`)**：
    *   底層儲存與工作區抽象目錄。集中管理 `WorkspaceManager` (工作區隔離) 與 `InboxBuffer` 快取的儲存介面，隱藏具體資料庫與實體檔案系統的實作細節。

---

## 5. 開發規範 (Development Guidelines)
*   **基礎設施錯誤處理 (Error Handling 分級制)**：
    *   **共用層級錯誤 (Shared Infra Errors)**：若錯誤發生在全局共用的基礎設施（例如：全域 `EventBus` 網路斷線、資料庫連線池崩潰），不應粗暴地 throw 導致進程崩潰，而是必須呼叫「**系統預設 Recorder (Global LogManager)**」記錄為 System Alert，交由系統監控模組統一處理。
    *   **任務層級錯誤 (Contextual/Task Errors)**：若錯誤屬於特定 Agent 或 Task 的執行流（例如：`WorkspaceManager` 建立特定分支失敗、處理特定的 `DataBlock` 格式錯誤），**絕對禁止**底層默默使用 `console.warn` 吞没錯誤。此時必須**直接 `throw` 例外**，將控制權精準拋還給發起呼叫的 Agent。這確保了 Agent 能在專屬的 Oplog 中捕獲該錯誤，及時觸發 `[ACT]` 階段進行決策修正。
