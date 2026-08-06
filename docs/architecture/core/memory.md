---
title: 記憶與狀態管理
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes: 
  - ../../src/core/messaging/DataBlock.ts
  - ../../src/core/utils/LRUCache.ts
  - ../../src/core/infra/LogManager.ts
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
  - ../agent/task.md
---

# 記憶與狀態管理 (Memory & State Management)

負責運行時的資料傳遞與防幻覺上下文管理。

## 核心組件

### `DataBlock` (動態狀態區塊)
*   **行為與資料結構**：
    1. **雙軸語意編碼 (Dual-Axis Semantics)**：
       *   **`type` (Message 角色類型)**：為強型別 Enum，限定為 `'message' | 'tool' | 'system'`。此欄位直接與大模型的 Message 角色（Human, Tool, System）完美對齊，決定了 DataBlock 在被時序插針投影給 LLM 時的 Message Role。
       *   **`intent` (業務意圖名稱)**：一個字串（e.g. `'TASK_SUCCESS'`, `'GIT_CONFLICT'`, `'HITL_APPROVED'`），用以標記具體發生的系統或業務事件。
    2. **控制面與資料面分離 (Control/Data Plane Separation)**：為避免 `EventBus` 遭遇巨量負載，`DataBlock` 僅可夾帶巨型資料的**指標 (Pointer) 或 URI**（指向實體檔案或外部快取），真正的資料本體交由底層資料面處理。
    3. **Claim Check Pattern (資料指標模式)**：當 `DataBlock` 乘載的 `controlPayload` 內部字串過大（例如超出 Token 安全閾值）時，系統會自動將該長字串抽離，寫入實體 Blob 檔案，並在原位置替換為 `DataPointer` (例如 `{"_type": "DataPointer", "blobId": "..."}`)，確保歷史紀錄 (Oplog) 不會因龐大資料而崩潰。

### 上下文管理 (Context Management)
*   **職責**：維護 Agent 的操作歷史與上下文視窗，防止 Context Drift (上下文漂移)。
*   **行為**：
    1. **去中心化儲存 (Decentralized Storage)**：歷史紀錄 (`history.jsonl`) 與內部運行日誌透過 `IDataBlockRepository` 直接實體化寫入，並透過 `SessionManager` 的 Inbox 機制處理暫存。
    2. **滾動截斷與指標卸載 (Blob Offloading)**：為了避免重複 I/O，控制流會自動呼叫 Repository 的卸載功能，將 `DataBlock` 中過大的 payload 改寫為 `DataPointer`，然後才進行存檔。完美解決了 Token 撐爆問題，並確保單一訊息只會存檔一次 Blob。
    3. **時間感知插針 (Temporal Context Injection)**：為了讓 Agent 具備時間流逝的感知能力，系統會動態比對相鄰歷史訊息的時間戳。若間隔超過設定閾值，則會在該位置即時安插虛擬的 `SystemMessage`。
    4. **極限效能最佳化 (Performance Optimizations)**：
       *   **延遲壓縮 (Debounced Compaction)**：`DataBlock` 帶有瞬態的 `isCompacted` 標記，避免重複掃描已經處理過的歷史訊息，將時間複雜度降至 O(1)。
       *   **通用 LRU 快取機制 (LRU Cache Utility)**：系統提供繼承自原生 `Map` 的泛型 `LRUCache` 工具類別，支援 O(1) 的存取與淘汰策略，避免高並發存取時的記憶體洩漏隱患。
       *   **異步檔案寫入 (Async File I/O)**：底層日誌傳輸 (例如 `FileTransport`) 採用非同步機制，避免阻塞事件迴圈 (Event Loop)。

### 持久化與日誌 (Persistence & Transports)
*   **雙軌日誌架構 (Dual-Rail Logging)**：
    *   由 `LogManager` 實作。提供全域層級的 Recorder（用於基礎設施），同時支援注入上下文（如 Session/Agent ID）建立具備 Context 的 Logger。
    *   定義明確的操作類型 (`RecordAction`)，包含 `THOUGHT`, `TOOL_CALL`, `STATE_MUTATION`, `PLAN_UPDATE`。
*   **傳輸器實作 (Transports)**：
    *   內建 `ConsoleTransport` 提供終端機標準輸出。
    *   內建 `FileTransport` 支援非同步檔案寫入。
*   **儲存庫抽象 (Repositories)**：
    *   定義通用的 `IRepository` 介面，並以 `JsonFileRepository` 作為預設實作，提供標準化的檔案讀寫抽象與資料序列化。

### 工作空間管理器 (WorkspaceManager)
*   **職責**：負責 Session 工作區生命週期協調。不直接進行檔案 I/O，而是根據工作空間的類型 (VOLATILE / PERSISTENT) 動態加載對應的 StorageDriver，將所有檔案讀寫與指令執行委託給底層的驅動者。
*   **行為**：
    1. **雙層工作區拓撲 (Two-Tier Workspace Topology)**：支援 Session 級別的中央倉庫與 Agent 級別的專屬隔離工作區，確保複雜多工任務間的隔離性。
    2. **策略模式驅動 (Strategy Pattern for StorageDriver)**：依據工作區類型動態配置 `IStorageDriver`。針對 `VOLATILE` (短期/揮發性) 類型採用 `MemoryVfsStorageDriver`，而 `PERSISTENT` (長期/持久化) 類型則採用 `GitLocalStorageDriver`。
    3. **動態工具注入 (Dynamic Tool Injection)**：透過 `loadTools()` 方法，能夠根據底層驅動的能力動態返回可用的 Agent 工具集 (例如 `ReadFileTool`、`WriteFileTool`，並在驅動支援 `supportsCommandExecution` 時動態注入 `RunBashTool`)。
    4. **實體儲存庫 (Repositories)**：系統實作了多種針對檔案系統的實體儲存庫，包含 `FileSystemSessionRepository`、`FileSystemDataBlockRepository`、`FileSystemAgentStateRepository` 以及針對圖結構的 `JsonGraphRepository`，負責將系統業務資料安全地存入檔案系統。

---

## 工程防護機制 (Engineering Safeguards)

### 安全熔斷器 (Circuit Breaker)
除了排程器的 Timeout 防死鎖機制外，針對 TaskAgent 層級設有熔斷保護：
*   **觸發條件**：單次任務的最大連續錯誤修補深度大於限制，或單一 DataBlock 鎖定解析時間過長。
*   **處置動作**：系統將強制切斷循環，拋出不可恢復之錯誤 (Fatal Error)，並向 MainAgent 回報，防止 Token 被無限消耗。
