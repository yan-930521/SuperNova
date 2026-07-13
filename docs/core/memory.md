# 記憶與狀態管理 (Memory & State Management)

負責運行時的資料傳遞與防幻覺上下文管理。

## 核心組件

### `DataBlock` (動態狀態區塊)
*   **職責**：系統內所有節點（Agent 與 Worker）之間傳遞資訊與狀態的通用載體 (如同暫存器 Register)。
*   **行為**：
    1. **靈活路由**：不僅用於封裝 Worker 的執行結果，無論是 `SubAgent` 或 `Worker`，都能將資訊包裝成 `DataBlock` 發送給上級，或透過指定**唯一 ID** 點對點傳送給特定的 Agent。
    2. **控制面與資料面分離 (Control/Data Plane Separation)**：為避免 `EventBus` 遭遇巨量負載 (如大型 HTML、CSV 檔案) 導致記憶體溢出與序列化瓶頸，`DataBlock` 被嚴格定義為**控制面訊息**。若需跨節點傳遞巨型資料，`DataBlock` 中僅可夾帶該資料的**指標 (Pointer) 或 URI**（指向 `WorkspaceManager` 中的實體檔案或外部快取），真正的資料本體交由底層資料面處理。

### `InboxBuffer` (收件箱)
*   **職責**：暫存 `Agent` 在掛起期間接收到的所有 `DataBlock`。

### `ContextManager & Oplog` (上下文與操作日誌管理器)
*   **職責**：維護 Agent 的操作歷史與上下文視窗，防止 Context Drift (上下文漂移)。
*   **行為**：
    1. **去中心化儲存 (Decentralized Storage)**：Oplog **不再依賴統一的全局資料庫**。每個 Agent 的操作日誌將直接被實體化（例如寫入 `.oplog.jsonl`），強制儲存於 `WorkspaceManager` 為該 Agent 分配的**專屬隔離目錄**中。
    2. **滾動截斷**：維護專屬目錄內日誌檔案的頭尾滾動更新。
    3. **Hot-Lock (防幻覺鎖定)**：採用**事件驅動**或**主動鎖定**。當 `DataBlock` 包含錯誤狀態，或 Agent 顯式調用 `lock_context()` 時，立刻鎖定當前上下文免於截斷，確保 Agent 在反思排錯時擁有 100% 完整的錯誤現場資訊。

### `WorkspaceManager` (工作區與版本控制管理器)
*   **職責**：為每一個 Agent 與 Task 提供隔離的運行環境，並透過「分級儲存」徹底解決高併發下的磁碟 I/O 災難。
*   **行為**：
    1. **分級工作區 (Tiered Workspace) 與虛擬檔案系統 (VFS)**：
       * **`VOLATILE` (預設)**：針對網頁爬蟲、資料清洗、純邏輯推演等無專案副作用的短期任務，系統預設分配「記憶體虛擬檔案系統 (In-Memory VFS，如 `memfs`)」。Oplog 與暫存檔皆在 RAM 中高速讀寫，任務結束 (GC) 時瞬間無痛回收，徹底解放磁碟讀寫與 Inode 消耗。
       * **`PERSISTENT`**：僅當任務明確需要修改專案原始碼或跨 Agent 長期協作時，才在實體磁碟上建立專屬目錄與 Git 分支。
    2. **Git 版本控制整合 (針對 PERSISTENT 模式)**：強制使用 Git 追蹤實體專屬目錄內的所有變更。這確保了檔案層級的操作具備完美的可追溯性，為 Oplog 提供了實體檔案層面的底層依據。
    3. **並行隔離與 Agentic CI/CD (解決合併地獄)**：
       * 結合 Git Branch 或 Git Worktree 技術，多個並行的 Agent 或 Task 可在各自的隔離目錄中安全地修改專案檔案，互不干擾。
       * 當任務達到 `SUCCESS` 準備合併時，`WorkspaceManager` 會先進行 Dry-Run (試運作) 並觸發基礎 CI Hook (如編譯檢查)。
       * 若不幸遭遇 **Git 衝突 (`<<<<<<< HEAD`)** 或 **語義錯誤 (CI 失敗)**，`WorkspaceManager` 會中止操作並向上拋出衝突事件。上層 Agent (如領域主管) 接獲後，會主動派發一個 **「排錯與合併任務 (Conflict Resolution Task)」** 給特定的 `SubAgent`，由它像資深工程師一樣去閱讀 Diff、修復衝突後再次提交。這種設計完美確保了系統除錯邏輯的透明度與 Agent 的自主性。

---

## 工程防護機制 (Engineering Safeguards)

### 1. 安全熔斷器 (Circuit Breaker)
除了排程器的 Timeout 防死鎖機制外，針對 `SubAgent` 層級設有熔斷保護：
*   **觸發條件**：單次任務的**最大連續錯誤修補深度大於 3 層**（Depth > 3），或單一 DataBlock **鎖定解析時間過長**。
*   **處置動作**：系統將強制切斷該 `SubAgent` 的 PDCA 循環，拋出不可恢復之錯誤 (Fatal Error)，並直接向 `MainAgent` 進行異常回報，防止 Token 被無限消耗。

### 2. Oplog 回滾策略 (Rollback) - *[未來功能規劃]*
*   *(未來將引入 Oplog 滾動截斷的高階應用：允許 Agent 在 `[ACT]` 階段主動抹除錯誤分支的狀態，將系統退回至過去正確的歷史錨點，並重新派遣 Worker。)*
