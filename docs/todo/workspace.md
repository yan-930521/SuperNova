---
title: 運行時工作空間設計與擴展
version: 0.1.0
status: DRAFT
last_updated: 2026-08-06
---

# 工作空間與儲存驅動進階規劃

> **[TODO]** WorkspaceManager 與 StorageDriver (包含 Git Worktree 隔離) 已完成核心實作。以下為未來進階擴展與待探討的細節規劃。

## 1. 運行時工作空間進階設計 (Advanced Runtime Workspace)

目前系統已實現「一個 Session 維護一個 Workspace，並透過 Git Worktree 支援多 Agent 隔離」。以下為尚未實現的進階需求：

### 1.1. GC 與存檔策略 (Archival & Garbage Collection)
*   **待探討痛點**：當 Session 結束時，PERSISTENT 類型的 Workspace 目前保留在磁碟中，而 VOLATILE 會隨程序結束消失。我們該如何設計一套完整的「封存 (Archived)」機制？
*   **預期功能**：
    *   定期清理（GC）閒置過久的 Session Workspace 以釋放磁碟空間。
    *   提供歷史 Session 工作區的「回溯與再啟用 (Re-activation)」API，允許用戶將已封存的工作區重新掛載回記憶體或本地路徑中。

### 1.2. 跨工作區的協同與共享 (Cross-Workspace Collaboration)
*   **待探討痛點**：目前 `DataPointer` 嚴格限制只能存取所屬 Workspace 的檔案，實現了完美的物理隔離。如果 Agent A 的工作區需要參考 Agent B 的工作區產出，在「資料絕對不污染」的前提下，我們該如何實現？
*   **預期功能**：
    *   提供一個受控的、唯讀的「共享掛載（Shared Mount）」。
    *   實作「資料快照匯出（Data Snapshot Export）」，允許在不同 Session 或 Agent 之間以唯讀快照的形式傳遞大量 Context。
