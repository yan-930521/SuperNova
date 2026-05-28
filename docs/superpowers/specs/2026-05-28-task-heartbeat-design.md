# 規格文件：整合任務心跳與超時監控 (Task Heartbeat & Timeout Integration)

## 1. 背景 (Background)
目前 `TaskManager` 擁有獨立的超時監控邏輯，這與 `PulseEngine` 的職責有所重疊。為了簡化架構並提高效能，我們需要將任務心跳的監控功能遷移至 `PulseEngine`。

## 2. 目標 (Goals)
- 在 `PulseEngine` 中實現通用的任務監控機制。
- 移除 `TaskManager` 中的重複監控代碼。
- 確保任務超時能正確觸發失敗處理流程。

## 3. 詳細設計 (Detailed Design)

### 3.1 PulseEngine 增強
在 `src/infra/PulseEngine.ts` 中新增以下功能：
- **狀態追蹤**：使用 `Map<string, { lastActive: number, timeout: number }>` 追蹤監控中的任務。
- **監控 API**：
  - `watchTask(taskId, timeout)`: 將任務加入監控列表。
  - `unwatchTask(taskId)`: 移除監控。
  - `updateHeartbeat(taskId)`: 更新任務最後活動時間戳。
- **Tick 邏輯**：在每次 `tick()` 時，檢查是否有任務超過其設定的 `timeout`。

### 3.2 TaskManager 重構
在 `src/manager/TaskManager.ts` 中進行以下修改：
- **心跳監聽器**：`setupHeartbeatListener` 應改為呼叫 `PulseEngine.updateHeartbeat`。
- **任務生命周期控制**：
  - 在 `executeNode` 的 `TaskStatus.RUNNING` 階段呼叫 `watchTask`。
  - 在 `finally` 區塊呼叫 `unwatchTask`。
- **移除舊邏輯**：刪除 `lastHeartbeats`、`initTimeoutMonitor`、`checkTimeouts` 和 `handleTimeout`。

## 4. 資料流 (Data Flow)
1. `TaskManager` 啟動任務 -> 呼叫 `PulseEngine.watchTask`。
2. 任務執行中產生的 `TASK_HEARTBEAT` 事件 -> `TaskManager` 捕獲並呼叫 `PulseEngine.updateHeartbeat`。
3. `PulseEngine` 在 `tick()` 檢測到超時 -> 發布 `TASK_FAILED` 事件。
4. `TaskManager` (或其他組件) 處理 `TASK_FAILED` -> 更新任務狀態與持久化。

## 5. 測試策略 (Testing Strategy)
- **單元測試**：在 `PulseEngine.test.ts` 中測試任務超時觸發。
- **整合測試**：在 `TaskManager.test.ts` 中驗證當 `PulseEngine` 檢測到超時時，任務狀態是否正確更新。
