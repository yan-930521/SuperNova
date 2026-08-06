---
title: 會話進階功能規劃 (Session Advanced Features)
version: 0.1.0
status: DRAFT
last_updated: 2026-08-06
---

# 會話進階功能規劃 (Session Advanced Features)

> **[TODO]** 以下為會話管理系統已規劃但尚未實現的進階功能。

## 1. 人機協同閘道 (HITL Session Gateway)

當 `BaseAgent` 的子類別（如 `TaskAgent`）需要人類確認時（例如調用高危工具）：

1.  Agent 調用系統 API 發佈 `INTERRUPT` 類型的 `DataBlock`。
2.  `SessionManager` 捕獲此事件，將該 Session 狀態變更為 `INTERRUPTED`，並呼叫 `saveState()` 將當前狀態序列化存檔，隨後釋放相關 Agent 實例。
3.  外部 UI / API 接收到待審批通知。
4.  人類審批通過（或提供反饋內容）後，外部系統向 `SessionManager` 送入一個 `RESUME` 訊號。
5.  `SessionManager` 依據 `sessionId` 反序列化還原 Agents，將審批結果包裝為 `DataBlock` 塞入 Agent 收件箱，Agent 恢復 BUSY 狀態繼續運作。

## 2. 工作空間容錯驗證 (Workspace Fault-Tolerance Policy)

在系統重啟恢復流中，針對損毀會話的容錯處理：
*   **損毀會話**：若偵測到該會話的 Workspace 物理目錄遺失、損毀或發生 Git 損壞，**系統採取容錯跳過策略**：
    *   將該會話在磁碟中的 `session.json` 狀態強制更新標記為 `FAILED`。
    *   在系統日誌中發布 `WARNING` 級別的日誌，警告管理員該 Workspace 已毀損。
    *   **不拋出致命例外阻礙 Boot，而是跳過該會話，繼續引導恢復其他健康的會話**，保障 Runtime 內核的全局高可用性。

## 3. 垃圾回收 (VFS Session GC)

當 Session 進入 `COMPLETED` 或 `FAILED` 時，底層虛擬檔案系統中掛載在該 `sessionId` 下的所有記憶體暫存資源將會被一次性徹底銷毀，釋放伺服器記憶體。

## 4. Thread 分支合併與會話重播 (Thread Merge & Session Replay)

*   (待規劃細節)
