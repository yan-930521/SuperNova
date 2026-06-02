# CheckingAgent (審核者) 設計

`CheckingAgent` 負責品質把關，確保 `DoingAgent` 的產出符合 `PlanningAgent` 的預期。

## 1. 職責架構
- **結果驗證**: 讀取黑板上的執行結果與原始目標。
- **回饋產出**: 提供 Pass 或 Fail 的判定，並在失敗時給予具體的修復建議。
- **非行動性**: 此角色不應執行具備副作用的操作，專注於判斷與分析。

## 2. 核心事件訂閱
- `AgentEvents.Checking.Start`: 接收審核任務。

## 3. 虛擬代碼結構
```typescript
export class CheckingAgent extends BaseAgent {
  protected setupSubscriptions() {
    this.bus.subscribe(AgentEvents.Checking.Start, this.onCheckStart.bind(this));
  }

  private async onCheckStart(event: IEvent) {
    // 1. 獲取 Doing 的結果與目標
    // 2. 進行邏輯校核
    // 3. 發布 Pass 或 Fail 事件
  }
}
```
