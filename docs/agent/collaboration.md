# Agent 通訊與協作協議 (Collaboration Protocol)

本架構採用 **Flow 驅動狀態機 + 輕量事件通知模型**，
核心控制權集中於 `Flow.next()`，Agent 僅負責執行，不參與流程決策。

---

## 1. 通訊基座 (Communication Infrastructure)

- 系統仍採用 EventBus 作為訊號傳遞基礎設施
- EventBus 僅負責「觸發與通知」，不承載流程控制邏輯
- Flow 才是唯一的狀態機控制中心

---

### ✔ EventBus 職責收斂後：

- 傳遞 Flow Trigger
- 傳遞 Execution Signal
- 傳遞 System Control Event

❌ 不再承載：
- workflow routing
- agent chaining logic
- state transition logic

---

## 2. 協作模式：Flow 驅動 (Flow-driven Execution)

系統不再使用「Agent → Agent」事件鏈，
而是改為：

> Flow 控制執行節奏，Agent 僅作為 execution unit

---

### ✔ 核心流程

1. `Flow.next()` 決定當前 phase
2. Flow 發出 `PHASE_START` 訊號
3. 對應 Agent 執行任務
4. Agent 回傳 result（success / fail / escalate）
5. Controller 呼叫 `Flow.next(result)`
6. 進入下一個 phase 或結束

---

### ✔ Execution Loop

```text
Flow.next()
   ↓
PHASE_START (with phase context)
   ↓
Agent.execute()
   ↓
result
   ↓
Flow.next(result)
   ↓
repeat / finish