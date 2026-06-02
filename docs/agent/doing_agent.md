# DoingAgent (行動者) 設計

`DoingAgent` 是系統的實作核心，具備強大的語義對齊能力與工具呼叫能力。

## 1. 職責架構
- **任務執行**: 負責具體的 Action 執行（代碼編寫、API 呼叫等）。
- **語義對齊**: 能夠理解 L3 SOP 的程序指令，並與 L1 黑板上的 Key-Only 指標進行掛接。
- **結果回寫**: 執行完畢後將完整結果寫回黑板。

## 2. 核心事件訂閱
- `AgentEvents.Doing.Start`: 接收執行任務。

## 3. 虛擬代碼結構
```typescript
export class DoingAgent extends BaseAgent {
  protected setupSubscriptions() {
    this.bus.subscribe(AgentEvents.Doing.Start, this.onDoingStart.bind(this));
  }

  private async onDoingStart(event: IEvent) {
    // 1. 讀取任務 ID 與黑板 Keys
    // 2. 透過 read_blackboard(key) 獲取具體參數
    // 3. 執行 Actions 並捕捉異常
    // 4. 寫回結果並發布 Finish 或 Fail 事件
  }
}
```
