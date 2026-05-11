# EventBus 設計規範

*   **日期：** 2026-05-11
*   **狀態：** 已批准 (Auto-approved for implementation)
*   **目標：** 提供 SuperNova 基礎設施層的事件分發機制，支援解耦的組件通訊。

---

## 1. 核心接口 (IEventBus)

定義於 `interfaces/infra/IEventBus.ts`。

```typescript
import { IEvent } from '../models/IEvent';

/**
 * 事件總線接口
 * 負責系統內部的事件發布與訂閱。
 */
export interface IEventBus {
  /**
   * 發布事件
   * 將事件分發給所有對該類型感興趣的訂閱者。
   * @param event 符合 IEvent 結構的事件對象
   */
  publish(event: IEvent): void;

  /**
   * 訂閱事件
   * 註冊一個處理函數，當指定類型的事件發生時被調用。
   * @param type 事件類型字串 (精確匹配)
   * @param handler 處理函數 (接收 IEvent 作為參數)
   */
  subscribe(type: string, handler: (event: IEvent) => void): void;

  /**
   * 取消訂閱
   * 移除已註冊的處理函數。
   * @param type 事件類型字串
   * @param handler 原註冊的處理函數引用
   */
  unsubscribe(type: string, handler: (event: IEvent) => void): void;
}
```

---

## 2. 實作細節 (EventBus)

實作於 `src/infra/EventBus.ts`。

### 2.1 內部存儲
使用 `Map<string, Set<(event: IEvent) => void>>` 來管理訂閱者。
- Key 為 `type` (事件類型)。
- Value 為 `Set`，確保同一個處理函數不會被重複註冊，且移除效率為 O(1)。

### 2.2 發布邏輯 (publish)
1. 根據 `event.type` 從 Map 中獲取訂閱者集合。
2. 如果存在訂閱者，遍歷集合並逐一調用處理函數。
3. 調用時應使用 `try-catch` 包裹（或者交由 Handler 自行處理，基礎設施層暫不強制捕捉錯誤以維持高效，但需記錄日誌）。
4. 使用 `console.log` (或項目約定的 Logger) 輸出發布日誌（英文）。

### 2.3 訂閱與取消訂閱 (subscribe / unsubscribe)
- `subscribe`: 若類型尚未在 Map 中，初始化一個新的 Set。將 handler 加入 Set。
- `unsubscribe`: 從對應類型的 Set 中移除 handler。若 Set 為空，可考慮刪除該 Key 以節省內存。

---

## 3. 測試策略 (Testing)

測試於 `tests/infra/EventBus.test.ts`。

### 3.1 測試用例
1. **基本發布訂閱：** 訂閱 A 類型，發布 A 類型，確認 handler 被調用且收到正確數據。
2. **類型隔離：** 訂閱 A 類型，發布 B 類型，確認 handler 未被調用。
3. **多訂閱者：** 多個 handler 訂閱同一類型，發布時確認全部被調用。
4. **取消訂閱：** 訂閱後取消，發布時確認 handler 不再被調用。
5. **重疊訂閱：** 同一 handler 訂閱多次，確認僅被調用一次 (Set 特性)。

---

## 4. 依賴關係
- `interfaces/models/IEvent.ts`: 定義事件結構。
- `interfaces/infra/IEventBus.ts`: 定義組件接口。
