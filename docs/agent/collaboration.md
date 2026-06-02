# Agent 通訊與協作協議 (Collaboration Protocol)

本架構採用基於 EventBus 的事件驅動模式，結合集中式路由與去中心化執行。

## 1. 通訊基座 (Communication Infrastructure)
- **共享實例**: 所有參與協作的 Agent 共享一個特殊的 `EventBus` 實例。
- **實例持有**: 該 `EventBus` 實例由 `SupervisorAgent` 建立並持有。
- **依賴注入**: 其他角色 Agent (Planning, Doing, etc.) 在初始化時，由 `SupervisorAgent` 負責將該通訊實例「注入」其中。

## 2. 協作模式：主動路由 (Active Routing)
系統不採用傳統的線性硬編碼呼叫，而是透過事件流動來觸發狀態變遷：

- **事件發布**: Agent 完成階段工作後，發布特定類型的事件（例如 `EventType.Planning.Finish`）。
- **主動監聽與路由**: `SupervisorAgent` 監聽到特定事件後，根據內部的業務邏輯路由表，發布下一個階段的啟動事件（例如 `EventType.Doing.Start`）。
- **全雙工通訊**: 每個 Agent 均具備接收與發送能力，確保了回饋鏈路（如 `Checking.Fail` -> `Doing.Redo`）的靈活性。

## 3. 事件命名規範 (Naming Convention)
事件採用 `EventType.<Role>.<Action>` 格式，例如：
- `EventType.Planning.Finish`
- `EventType.Doing.Start`
- `EventType.Checking.Pass`
- `EventType.Acting.Execute`
