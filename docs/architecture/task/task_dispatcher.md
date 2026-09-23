---
title: 任務調度器與並發派發 (Task Dispatcher)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 任務調度器與並發派發 (Task Dispatcher)

任務調度器 (`src/core/task/TaskDispatcher.ts`) 是 SuperNova 負責將 TaskDAG 中就緒的任務節點，智慧分配給適任的 Worker 代理人並進行並發控制與進度追蹤的核心引擎。

---

## 1. 核心職責與派發迴圈

```mermaid
flowchart TD
    DAG["TaskDAG (狀態更新)"] -->|getReadyNodes()| Dispatcher["TaskDispatcher 派發引擎"]
    Dispatcher --> Pool["Agent 資源池狀態掃描\n(空閒狀態與角色特長匹配)"]
    Pool --> Match["選中適任 Worker Agent"]

    Match --> Route["透過 MessageRouter 將任務封裝為 DataBlock\n推入目標會話收件箱 (pushToInbox)"]
    Route --> Exec["Worker Agent 執行思考"]

    Exec --> Event["廣播 TaskCompleted / TaskFailed"]
    Event --> Dispatcher
    Dispatcher --> UpdateDAG["更新 TaskDAG 節點狀態\n釋放下游相依節點"]
```

---

## 2. 智慧調度策略

1. **角色能力匹配 (Skill-Based Matching)**：
   - 根據任務節點的標籤（例如 `#code_review`、`#frontend`），優先指派具備對應專長 Profile 的代理人。
2. **負載平衡與防重載 (Concurrency Control)**：
   - 嚴格遵守各 Worker 代理人的並發上限（預設單一代理人不並行執行多個重型任務），當代理人 `BUSY` 時等待其轉回 `IDLE`。
3. **超時熔斷與自動重試 (Timeout & Retry)**：
   - 為各節點維護執行計時器；若超過指定超時時間仍未收到成果提交，自動收回任務並在重試次數內重新排隊。
