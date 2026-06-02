# 任務自癒機制 (Self-Healing Strategy)

為了確保長時任務的穩健性，SuperNova 採用 3x3 階梯式自癒機制，處理執行過程中的異常與失敗。

## 1. 3x3 自癒階梯 (The 3x3 Ladder)

### 第一階：節點原地重試 (Node Retry * 3)
- **觸發條件**: 當 `DoingAgent` 或 `ActingAgent` 執行失敗且未達到重試上限時。
- **執行邏輯**: 
    - `SupervisorAgent` 捕獲失敗事件，記錄錯誤至黑板。
    - 保持當前任務上下文不變，再次發布 `Start` 事件。
- **上限**: 最多重試 3 次。

### 第二階：認知重規劃 (Cognitive Re-plan * 3)
- **觸發條件**: 當原地重試 3 次皆失敗，或 `CheckingAgent` 判定發生邏輯錯誤時。
- **執行邏輯**: 
    - `SupervisorAgent` 觸發 `EventType.Planning.Start` 事件。
    - `PlanningAgent` 讀取黑板上的失敗紀錄與環境現狀，重新拆解剩餘的 Phase 與 Tasks。
- **上限**: 最多重規劃 3 次。

### 第三階：終極掛起 (STUCK / HITL)
- **觸發條件**: 當重規劃 3 次後仍無法推進任務。
- **執行邏輯**: 
    - 系統標記任務狀態為 `STUCK`。
    - 暫停所有執行緒，保存黑板快照，等待人類介入 (Human-In-The-Loop)。

## 2. 狀態管理
- **錯誤紀錄**: 所有的失敗原因必須詳細寫入 L1 黑板的 `error_log` 變數。
- **重試計數**: Supervisor 負責維護每個 Task 的 `retry_count` 與 `replan_count`。
