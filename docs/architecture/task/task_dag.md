---
title: 任務排程與有向無環圖 (TaskDAG)
status: APPROVED
last_updated: 2026-08-09
related_codes:
  - ../../../src/core/task/TaskManager.ts
  - ../../../src/core/domain/ITask.ts
---

# 任務排程與有向無環圖 (TaskDAG)

## 1. 核心概念

SuperNova 使用 **有向無環圖 (DAG, Directed Acyclic Graph)** 作為任務執行的基礎架構。每一個複雜任務都會被分解為多個子任務節點 (Task Nodes)，並且透過 `dependencies` 陣列定義節點間的前後依賴關係。

這套機制的管理核心是 `TaskManager`，它運行在背景，負責整個 Session 生命週期內的任務狀態機演進。

## 2. 任務狀態機 (Task State Machine)

每一個 `ITask` 具備以下狀態，由 `TaskManager.refreshTaskStates()` 負責推進：

- `PENDING`：任務已建立，但其前置依賴任務 (Dependencies) 尚未全部完成。
- `READY`：任務的所有前置依賴均已標記為 `COMPLETED`。此狀態的任務可以隨時被指派給 Agent 執行。
- `IN_PROGRESS`：任務已被指派給 Agent，正在執行中。
- `COMPLETED`：任務成功執行完畢，結果已回報。
- `FAILED`：任務執行失敗，或遭遇不可預期的錯誤。
- `CANCELED`：任務被取消，通常是因為其前置依賴任務失敗所觸發的級聯取消。

## 3. LATS (Language Agent Tree Search) 前置規劃引擎

在任務進入 DAG 系統前，系統支援透過 `StrategizeAndPlanTool` 工具結合 LATS 演算法進行前置規劃：

1. **策略搜尋 (Strategy Search)**：使用 UCB1 演算法在自然語言層面進行多路徑搜尋與反思。
2. **非同步執行**：由於 MCTS 搜尋耗時較長，工具呼叫後會立即回傳給 Agent。
3. **事件回報**：背景運算完成後，系統會透過 EventBus 廣播 `BACKGROUND_TASK_COMPLETED` 訊息，告知 Agent 最終生成的具體任務圖。

## 4. 防死鎖與級聯取消 (Cascading Cancellation)

### 4.1 依賴解鎖
當任一節點狀態變更為 `COMPLETED` 時，`TaskManager` 會自動檢查其所有下游任務 (Downstream Tasks)。若某個下游任務的所有依賴皆已滿足，狀態會自動從 `PENDING` 轉為 `READY`。

### 4.2 級聯取消
若任一節點狀態變更為 `FAILED` 或 `CANCELED`，為了避免下游任務無限期死鎖在 `PENDING` 狀態，`TaskManager` 會觸發級聯取消 (Cascading Cancellation)，將所有直接或間接依賴該節點的任務狀態標記為 `CANCELED`，並記錄取消原因。

## 5. 無縫整合調度閉環

DAG 系統僅負責「任務節點間的關聯與狀態演進」，並不直接負責 Agent 的生殺大權。
當狀態變為 `READY` 時，任務會透過前述的 **Task Dispatch & Orchestration Loop** 進入調度階段。具體可參閱 [`task_dispatch.md`](./task_dispatch.md)。
