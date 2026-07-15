---
title: 記憶與狀態管理
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes: []
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
  - ../agent/task.md
---

# 記憶與狀態管理 (Memory & State Management)

負責運行時的資料傳遞與防幻覺上下文管理。

## 核心組件

### `DataBlock` (動態狀態區塊)
*   **職責**：系統內所有節點（Agent 與 Worker）之間傳遞資訊與狀態的通用載體，同時也是系統事件的 Message 封裝。
*   **行為與資料結構**：
    1. **雙軸語意編碼 (Dual-Axis Semantics)**：
       *   **`type` (Message 角色類型)**：為強型別 Enum，限定為 `'message' | 'tool' | 'system'`。此欄位直接與大模型的 Message 角色（Human, Tool, System）完美對齊，決定了 DataBlock 在被時序插針投影給 LLM 時的 Message Role。
       *   **`intent` (業務意圖名稱)**：一個字串（e.g. `'TASK_SUCCESS'`, `'GIT_CONFLICT'`, `'HITL_APPROVED'`），用以標記具體發生的系統或業務事件。
    2. **靈活路由**：不僅用於封裝 Worker 的執行結果，無論是 `SubAgent` 或 `Worker`，都能將資訊包裝成 `DataBlock` 發送給上級，或透過指定**唯一 ID** 點對點傳送給特定的 Agent。
    3. **控制面與資料面分離 (Control/Data Plane Separation)**：為避免 `EventBus` 遭遇巨量負載，`DataBlock` 僅可夾帶巨型資料的**指標 (Pointer) 或 URI**（指向 `WorkspaceManager` 中的實體檔案或外部快取），真正的資料本體交由底層資料面處理。

### `InboxBuffer` (收件箱)
*   **職責**：暫存 `Agent` 在掛起期間接收到的所有 `DataBlock`。

### `ContextManager & Oplog` (上下文與操作日誌管理器)
*   **職責**：維護 Agent 的操作歷史與上下文視窗，防止 Context Drift (上下文漂移)。
*   **行為**：
    1. **去中心化儲存 (Decentralized Storage)**：每個 Agent 的操作日誌與內部運行日誌直接實體化（例如寫入 `.oplog.jsonl` 與 `agent.log`），強制儲存於**專屬的實體日誌目錄**中，**完全獨立於 `WorkspaceManager`** 的任務隔離區。
    2. **滾動截斷**：維護專屬目錄內日誌檔案的頭尾滾動更新。
    3. **Hot-Lock (防幻覺鎖定)**：採用**事件驅動**或**主動鎖定**。當 `DataBlock` 包含錯誤狀態，或 Agent 顯式調用 `lock_context()` 時，立刻鎖定當前上下文免於截斷，確保 Agent 在反思排錯時擁有 100% 完整的錯誤現場資訊。

### `WorkspaceManager` (工作區與儲存管理器)
*   **職責**：以 Session 為基本安全與隔離邊界，為每個 Session 維護一個唯一的 Workspace，管理工作空間的狀態。
*   **行為**：
    1. **Session 獨佔 Workspace**：Workspace 由 Session 創建與持有，同一會話內的所有任務與 Agent 都操作該 Session 的唯一工作區。
    2. **計算與儲存解耦**：去除了運行時 Container 的直接控制，只負責儲存狀態與檔案快照的變更歷史。
    3. **分級與多驅動擴充 (Storage Drivers)**：支援本地檔案系統、Git、虛擬記憶體檔案系統 (memfs) 以及遠端 SSH 等多種儲存媒介。

---

## 3. 運行時工作空間設計與擴展 (Runtime Workspace Design)

為了實現「一個 Session 維護一個 Workspace，計算解耦，未來可擴充 Workspace」的目標，我們將 Workspace 與儲存管理器定義為以下大方向模組，並在下方標註目前待探討的細節痛點：

### 3.1. SessionManager (會話管理器)
*   **大方向職責**：
    *   作為用戶請求的入口，建立與維護 `Session` 的生命週期。
    *   在會話啟動時，向 `WorkspaceManager` 申請一個專屬的工作空間（Workspace），並將 `sessionId` 與 `workspaceId` 進行強綁定。
*   **📝 待探討的細節問題 (Open Questions)**：
    *   *GC 與存檔策略*：當 Session 結束時，對應的 Workspace 應該直接銷毀（如 VOLATILE），還是進行封存（Archived）？如何提供歷史 Session 工作區的回溯與再啟用？

### 3.2. WorkspaceManager (工作空間管理器)
*   **大方向職責**：
    *   **雙層工作空間拓撲 (Two-Tier Workspace Topology)**：
        1.  **Session 級別的獨立 Repo (Session-level Isolated Repo)**：在用戶主專案外（如被 gitignore 的 `workspace/<sessionId>`）執行 `git init`，做為一個全新的、空白的、**與用戶主專案 100% 物理隔離的中央共享倉庫**。
        2.  **Agent 級別的工作樹 (Agent-level Worktrees)**：當 Session 內有多個 Agent 需要並行協作時，**在此 Session 倉庫內**，透過 `git worktree add -b <branchName> .worktrees/<agentId>` 建立子工作樹目錄，供 Agent 在 VFS/Docker 中進行無干擾開發。
        3.  **無污染合併**：各 Agent 開發完成後，其分支會 merge 回 Session 倉庫的 `main` 分支。Session 結束後，用戶可安全地從此獨立目錄獲取產出成果。
    *   **高階狀態管理**：提供高階事務介面（如初始化、提交變更、建立快照 Checkpoint、回滾 Rollback、合併）。
    *   **功能性介面暴露（動態 Tool 包裝）**：對外暴露一組統一的存取讀寫（`readFile`, `writeFile`, `listFiles`）與命令執行（`runBash`）函數。這些函數在底層會自動將操作範圍限制在該 Session 工作區的相對路徑與上下文中，並在 Control Plane 層面被隱式柯里化（Curry）綁定 `sessionId`，動態包裝為 Tools 提供給 Agent 調用。
*   **📝 已對齊的細節設計 (Aligned Designs)**：
    *   *安全物理隔離*：徹底拋棄「在用戶主專案直接建立 git worktree」的作法，改用獨立 Git 倉庫。Agent 絕對碰不到用戶主專案。
    *   *Git 快照事務回滾*：利用獨立倉庫的 `git commit` 與 `git reset --hard HEAD`，支援 Agent 的 Save/Load 存檔與回滾機制，消除編譯/測試失敗時的上下文污染。

### 3.3. StorageDriver (儲存驅動者 - 核心擴充點)
*   **大方向職責**：
    *   **儲存面與管理面解耦**：定義統一的 `IStorageDriver` 介面（`init`, `readFile`, `writeFile`, `listFiles`, `executeCommand`, `commit`, `merge`, `destroy`）。
    *   **驅動獨立化 (Standalone Drivers)**：
        *   `MemoryVfsStorageDriver`：專注於 `memfs` 的記憶體虛擬讀寫（`VOLATILE` 模式），不支援 Shell 指令。
        *   `GitLocalStorageDriver`：專注於本地空倉庫的 `git init` 初始化、檔案寫入與本地 Shell 指令執行。
    *   讓 `WorkspaceManager` 根據 Session 的類型與配置動態載入對應的 StorageDriver，使控制面與底層儲存完全解耦。

### 3.4. DataBlock & DataPointer (安全資料流)
*   **大方向職責**：
    *   作為任務間資料傳遞的媒介。
    *   **防安全逃逸**：`DataPointer` 嚴格限制只能使用相對於 Workspace 根路徑的**相對路徑**（如 `src/index.ts`），從底層杜絕 AI 讀取宿主機敏感檔案的可能性。
*   **📝 待探討的細節問題 (Open Questions)**：
    *   *跨工作區的協同與共享（Cross-Workspace Collaboration）*：如果 Alice 的工作區需要參考 Bob 的工作區產出，在「資料絕對不流通」的前提下，我們該如何提供一個受控的、唯讀的「共享掛載（Shared Mount）」或「資料複製品（Data Snapshot Export）」？

---

## 4. 工程防護機制 (Engineering Safeguards)

### 4.1. 安全熔斷器 (Circuit Breaker)
除了排程器的 Timeout 防死鎖機制外，針對 `SubAgent` 層級設有熔斷保護：
*   **觸發條件**：單次任務的**最大連續錯誤修補深度大於 3 層**（Depth > 3），或單一 DataBlock **鎖定解析時間過長**。
*   **處置動作**：系統將強制切斷該 `SubAgent` 的 PDCA 循環，拋出不可恢復之錯誤 (Fatal Error)，並直接向 `MainAgent` 進行異常回報，防止 Token 被無限消耗。
