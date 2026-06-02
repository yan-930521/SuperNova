# BaseAgent (代理基類) 設計

`BaseAgent` 是所有專業角色 Agent 的抽象基類，負責處理通訊匯流排的掛接與基本的依賴注入。

## 1. 類別定義
```typescript
export abstract class BaseAgent {
  constructor(
    public readonly id: string,
    protected readonly bus: IEventBus,    // 注入事件匯流排
    protected readonly blackboard: IBlackboard // 注入 L1 黑板系統
  ) {
    this.setupSubscriptions();
  }

  /**
   * 子類必須實作，定義其監聽的 AgentEvents
   */
  protected abstract setupSubscriptions(): void;

  /**
   * 通用的狀態與日誌紀錄工具
   */
  protected log(msg: string, level: 'info' | 'error' = 'info'): void {
    // 透過 LogManager 進行非同步紀錄
  }
}
```

## 2. 核心邏輯
- **事件驅動**: 不再持有 `CommandBus`，所有的行為觸發均來自 `bus.subscribe`。
- **黑板存取**: 具備直接讀寫 L1 黑板的能力，這是 Agent 獲取任務上下文的唯一路徑。
- **無狀態性**: Agent 本身不應持有長期狀態，所有執行中的狀態必須回寫至黑板。
