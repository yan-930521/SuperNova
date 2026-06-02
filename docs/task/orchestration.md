# 任務編排與調度協議 (Task Orchestration)

SuperNova 採用「分層規劃、集中調度、非同步併發」的任務編排模型。

## 1. 任務結構 (Task Structure)
任務由 `PlanningAgent` 進行拆解，形成一個兩層級的樹狀結構：

- **Phase (階段)**: 高層次的里程碑（如：環境準備、核心開發、整合測試）。
- **Task (具體任務)**: Phase 下的可執行單元。每個 Task 必須標註所需的 Agent 角色與前置依賴。

## 2. 調度與派發 (Scheduling & Dispatching)
- **提交**: `PlanningAgent` 完成拆解後，將整棵任務樹提交給 `SupervisorAgent`。
- **派發 (Dispatching)**: `SupervisorAgent` 負責解析任務樹：
    - **併發支援**: 對於沒有相互依賴或依賴已滿足的 Tasks，Supervisor 會同時發布多個 `EventType.<Role>.Start` 事件。
    - **生命週期管理**: Supervisor 監聽黑板狀態與完成事件，動態推動任務鏈。

## 3. 執行與回饋 (Execution Loop)
- **非同步執行**: 被通知的 Agent（如 DoingAgent）領取任務後，獨立執行並操作黑板。
- **狀態回寫**: 任務完成後，Agent 將結果與 `status: completed` 標籤寫回黑板，並發布 `Finish` 事件告知 Supervisor。
- **Phase 變遷**: 當一個 Phase 下的所有必要 Tasks 皆完成後，Supervisor 才會發布下一個 Phase 的啟動信號。
