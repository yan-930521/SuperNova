# ActingAgent (改善者) 設計

`ActingAgent` 負責 PDCA 的最後一環：總結與制度化。

## 1. 職責架構
- **經驗總結**: 分析整輪任務的成功與失敗點。
- **知識升級**: 將成功的作法寫入 L3 SOP，將穩定的環境資訊寫入 L2 Fact。
- **循環重啟**: 根據失敗原因，建議下一輪 Planning 的重點。

## 2. 核心事件訂閱
- `AgentEvents.Acting.Start`: 接收改善總結任務。

## 3. 虛擬代碼結構
```typescript
export class ActingAgent extends BaseAgent {
  protected setupSubscriptions() {
    this.bus.subscribe(AgentEvents.Acting.Start, this.onActStart.bind(this));
  }

  private async onActStart(event: IEvent) {
    // 1. 掃描 L4 歷史與當前黑板結果
    // 2. 自動更新 L2/L3 記憶體
    // 3. 發布 Finish 並告知 Supervisor 循環是否結束
  }
}
```
