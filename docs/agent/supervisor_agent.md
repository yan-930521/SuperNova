# SupervisorAgent (指揮官) 設計

`SupervisorAgent` 是系統的中樞神經，負責全局路由、任務派發與 3x3 自癒管理。

## 1. 職責架構
- **路由中樞**: 監聽所有 Agent 的 `Finish` 與 `Fail` 事件，決定下一個要發送的事件。
- **自癒管理**: 持有 `retryTracker`，負責執行 3x3 自癒策略（原地重試 3 次，失敗後觸發重規劃）。
- **黑板初始化**: 在任務開始前，負責向黑板注入 L2 事實索引與 L3 SOP ID。

## 2. 核心事件訂閱
- `AgentEvents.Supervisor.Dispatch`: 接收外部輸入。
- `AgentEvents.Planning.Finish`: 接收任務樹，開始派發 Tasks。
- `AgentEvents.Doing.Finish / Fail`: 追蹤執行狀態並處理自癒。
- `AgentEvents.Checking.Pass / Fail`: 處理品質審核回饋。

## 3. 虛擬代碼結構
```typescript
export class SupervisorAgent extends BaseAgent {
  private retryMap = new Map<string, number>();

  protected setupSubscriptions() {
    this.bus.subscribe(AgentEvents.Supervisor.Dispatch, this.onDispatch.bind(this));
    this.bus.subscribe(AgentEvents.Planning.Finish, this.onPlanningFinish.bind(this));
    this.bus.subscribe(AgentEvents.Doing.Fail, this.onDoingFail.bind(this));
    // ... 其他路由訂閱
  }

  private onPlanningFinish(event: IEvent) {
    // 讀取黑板上的 Phase-Task 樹
    // 發布第一個可執行的 Doing.Start
  }
}
```
