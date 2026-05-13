# SuperNova 架構設計 (Architecture Design)

## 1. 系統核心理念
SuperNova 採用 **數據驅動 (Data-Driven)** 與 **組件化行為 (Component-Based Behavior)** 設計。系統運作依賴於事件流與狀態變更，而非硬編碼的程序邏輯。

## 2. Agent 執行模型 (Component-Based Architecture)
Agent 不再是單一龐大的類別，而是具備生命週期的 **容器 (Container)**。

### 2.1 行為組件化 (Component Composition)
- **BaseAgent:** 作為核心殼層 (Shell)，負責狀態管理與生命週期。
- **IAgentComponent:** 標準化組件接口，所有行為（規劃、思考、裁決）皆以組件形式掛載。
- **配置驅動:** Agent 的行為與能力透過 JSON 定義，由 `AgentComponentFactory` 動態實例化並注入。

### 2.2 處理流程 (Data Flow)
1. **輸入接收:** 透過 `EventBus` 或 `receiveTask` 接收目標。
2. **組件執行:** Agent 顯式檢索組件 (如 `planner`, `reasoner`)。
3. **純數據輸出:** 組件處理後輸出 `Partial<IAgentState>` 或執行意圖 (`Intent`)。
4. **狀態合併:** Agent 將數據變更合併至 `IAgentState` (單一真理來源)。
5. **行為分發:** 若產出 `Intent`，則由系統轉發至 `ToolRuntime` 執行。

## 3. 系統分層
- **Global Runtime:** 全局調度核心 (Tick, Session 管理)。
- **Session Layer:** 任務上下文 (TaskGraph, ContextView, OpLog)。
- **Behavior Layer (組件層):** 具體規劃、思考與裁決演算法。
- **Execution Layer:** 執行單位 (WorkerAgent, ToolRuntime)。

## 4. 數據與通訊
- **狀態 (State):** 採用 LangGraph 結構，所有操作均為狀態變更。
- **通訊 (Communication):** 異步訊息驅動，強制攜帶 `TraceContext` 以確保可觀測性。
