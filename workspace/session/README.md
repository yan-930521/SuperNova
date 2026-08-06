# Session 動態運行資料庫 (Runtime Storage)

> ⚠️ **【AGENT 嚴格規範警告 / AGENT STRICT WARNING】** ⚠️
> 本目錄 (`workspace/session/`) 為系統底層自動管理的動態沙盒與狀態儲存區。
> **任何 Agent 嚴禁手動讀寫、修改或刪除此目錄下的任何檔案。**

## 目錄職責說明

本目錄儲存了 SuperNova 系統在執行期間所有的動態資料，由系統核心 (Core) 的 `SessionManager`, `ContextManager`, 與 `WorkspaceManager` 完全接管。它包含但不限於：

1. **對話日誌與歷史記憶 (Oplog)**：各個 Agent 的 `.jsonl` 歷史紀錄，用於狀態還原與時空旅行。
2. **代理人狀態快照 (State Snapshots)**：Agent 被掛起 (Suspend) 或脫水 (Dehydrate) 時，其記憶體狀態與 Token 消耗量會被序列化並儲存於此。
3. **任務專屬沙盒 (Task Workspaces)**：各個 TaskAgent 執行任務時所配置的隔離資料夾，內含 `.git` 版本控制庫與暫存檔案。

## 給 Agent 的操作指引

*   **如果需要讀寫檔案**：請使用 `WorkspaceManager` 注入給您的 `ReadFileTool`, `WriteFileTool` 等專用工具，工具會自動將路徑映射到您所屬的專用沙盒內。
*   **絕對禁止 Path Traversal**：切勿試圖使用相對路徑 (如 `../../session/`) 逃逸沙盒並存取本目錄，否則將觸發底層安全警報並可能導致您的任務直接終止 (Terminate)。
*   **垃圾回收 (GC)**：系統會在任務完成或 Session 銷毀時，自動對此目錄下無用的沙盒與暫存狀態進行清理 (Garbage Collection)。請專注於您的目標，無須干預底層記憶體管理。
