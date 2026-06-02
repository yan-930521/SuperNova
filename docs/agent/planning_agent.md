# PlanningAgent (規劃師) 設計

`PlanningAgent` 負責將高階目標轉化為具備拓撲結構的執行計畫。

## 1. 職責架構
- **任務拆解**: 讀取 L1 黑板中的目標，參考 L3 SOP 庫。
- **Phase-Task 生成**: 產出兩層級的任務樹，並標註 Task 的依賴關係與所需角色。
- **黑板寫入**: 將生成的任務樹寫回 L1 黑板，供 Supervisor 讀取。

## 2. 核心事件訂閱
- `AgentEvents.Planning.Start`: 接收規劃指令。

## 3. 虛擬代碼結構
```typescript
export class PlanningAgent extends BaseAgent {
  protected setupSubscriptions() {
    this.bus.subscribe(AgentEvents.Planning.Start, this.onPlanStart.bind(this));
  }

  private async onPlanStart(event: IEvent) {
    // 1. 讀取目標
    // 2. 檢索 L3 SOP 索引
    // 3. 產出 Phase + Tasks 結構
    // 4. 寫入黑板並發布 Finish 事件
  }
}
```
