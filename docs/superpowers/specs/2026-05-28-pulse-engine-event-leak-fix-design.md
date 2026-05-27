# Spec: PulseEngine 事件訂閱洩漏修復

## 背景
在當前的 `PulseEngine` 實作中，`EVENT` 類型的掛鉤（Hook）在註冊時會向 `EventBus` 訂閱事件，但在移除掛鉤（`unregisterHook`）或重複註冊相同 ID 的掛鉤時，沒有進行取消訂閱的操作。這會導致記憶體洩漏以及重複觸發動作的問題。

## 變更範圍

### 1. 基礎設施介面更新
**檔案：** `src/infra/types/events.ts`
- 在 `IEventBus` 介面中新增 `unsubscribe` 方法。
- 方法簽署：`unsubscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void;`

### 2. PulseEngine 內部管理優化
**檔案：** `src/infra/PulseEngine.ts`
- **狀態管理**：新增私有屬性 `eventHandlers` (Map<string, (event: any) => void>)，用於映射掛鉤 ID 與其對應的事件處理函式。
- **註冊邏輯 (`registerHook`)**：
    - 在註冊新掛鉤前，先呼叫 `unregisterHook(hook.id)` 以確保清理舊有的同名掛鉤。
    - 對於 `EVENT` 類型掛鉤：
        1. 建立處理函式。
        2. 將處理函式存入 `eventHandlers` 映射中。
        3. 向 `eventBus` 訂閱事件。
- **解除註冊邏輯 (`unregisterHook`)**：
    - 檢查欲移除的掛鉤是否為 `EVENT` 類型。
    - 若是且存在對應的處理函式，則呼叫 `this.eventBus.unsubscribe` 進行清理。
    - 從 `eventHandlers` 和 `hooks` 映射中移除相關條目。

## 驗證計畫

### 自動化測試
- **單元測試**：在 `tests/infra/PulseEngine.test.ts` 中新增測試案例：
    - 驗證重複註冊相同 ID 的 `EVENT` 掛鉤會先取消之前的訂閱。
    - 驗證呼叫 `unregisterHook` 會正確呼叫 `eventBus.unsubscribe`。
- **回歸測試**：確保現有的 Tick 和 THRESHOLD 掛鉤功能正常。
