# SuperNova 專案缺口報告

> 日期：2026-05-12
> 評估範圍：技術實作缺口、已偵測的模擬/未實現區塊、工業化落地風險

## 1. 總覽

目前專案呈現「原型／架構雛形」狀態。核心結構與接口已有雛形，但多數執行流程仍停留在模擬與骨架階段。專案中「模擬」字眼應視為尚未完成的功能，已納入本報告。

## 2. 已觀察到的主要缺口

### 2.1 Session 執行邏輯僅為模擬

- `src/session/BaseSession.ts` 的 `tick()` 只執行：調度、彈出 ReadyQueue、打印執行日誌、並直接宣告任務成功。
- 目前沒有真實工具呼叫、Agent 決策、錯誤處理、重試機制或失敗回滾流程。
- `BaseSession.tick()` 中的註解已顯示「模擬並行執行就緒任務」，代表這段邏輯暫未落實為真正的任務執行引擎。

### 2.2 真正的 TaskGraph 規劃未完成

- `src/agent/CoordinatorAgent.ts` 的 `planTaskGraph(goal: string)` 目前僅回傳 `{}`。
- 因此目前缺少 Coordinator 層將目標轉換為任務 DAG 的能力。
- 雖然 `arbitrateMutations` 有基本衝突裁決邏輯，但整體協調流程仍不完整。

### 2.3 模型推理與 Agent 狀態更新仍屬示意

- `src/runtime/ModelRegistry.ts` 中 `InferenceEngine.infer()` 對 LangChain 的組裝具備雛形，但內部只以註解方式說明應該如何更新 `state.messages`。
- `ModelRegistry` 只提供模型註冊與取用，沒有測試或 demo 中的真實模型注入情境。
- 文件與程式註解多次使用「模擬將結果添加回訊息流中」，代表目前尚未實現狀態管理收斂。

### 2.4 Demo 與整合測試大量使用 Mock

- `scripts/run-demo.ts` 是手動構造 `TaskGraph`，並在 `tick()` 中攔截後自行分派工具呼叫。
- `tests/integration/EndToEnd.test.ts` 使用 `MockSearchTool`、`MockSummarizeTool`、`MockWorkerAgent` 等，並以 fake timers 驗證 `BaseSession` 調度流程。
- 「模擬」測試說明這些案例只驗證流程、而非完整功能。這意味著現有整合測試並未涵蓋真實 AI 服務、工具執行或 Agent 推理。

### 2.5 Guardian 與錯誤策略尚不健全

- `src/runtime/Guardian.ts` 的 `protect()` 透過 `Promise.race` 實現超時保護。
- `resolveStrategy()` 對超時、SyntaxError、ReferenceError 提供簡單策略，但對其他錯誤類型仍返回 `IGNORE`。
- 工業級守護應該支援更多策略（例如：輕量重試、錯誤等級分類、失敗降級），目前實作過於簡化。

### 2.6 `AgentRegistry` 動態載入依賴 JSON、缺少範例

- `src/infra/AgentRegistry.ts` 的 `loadAgentById()` 依賴 `agents/${id}.json`。
- 專案中目前沒有明顯可見的 `agents/` 配置範例或 JSON 規範文件。
- 這種動態載入方式若未補齊配置樣板，實際部署時會成為隱藏依賴。

### 2.7 Session 管理與快照機制仍未真正驗證

- `BaseSession` 有 `snapshot()` 和 `rollback()`，但目前 `tick()` 模擬成功後直接進入快照，尚未驗證錯誤回滾與數據一致性。
- `SessionManager.restoreFromSnapshot()` 只是 JSON 反序列化，沒有測試複雜狀態恢復。
- `BaseSession.exportLog()` 回傳空字串，表示日誌輸出尚未落實。

### 2.8 文件與專案狀態不一致

- `docs/superpowers/plans/2026-05-11-implement-guardian.md`、`...-implement-agent-registry.md`、`...-implement-coordinator-agent.md` 都含有 `TODO`、`Not implemented` 或預期失敗示例。
- 這表明專案設計階段已有完整規劃，但部分核心功能尚未完成或尚未同步至最終實作。

### 2.9 LLM/智能體串接仍屬未實現里程碑

- `README.md` 中明確標記 Phase 6：LLM 智力串接尚未完成。
- 專案雖採用 `@langchain/core` 與 `@langchain/langgraph`，但沒有真實模型配置、API key 注入、或完整 prompt-to-response 流程示例。

## 3. 風險評估

- 目前專案偏向「框架雛形 + 模擬驗證」，尚未達到工業級可部署標準。
- 真正的運行時執行路徑（Agent -> TaskGraph -> Tool -> Snapshot/rollback）仍未完全貫通。
- 測試覆蓋重點在調度流程，而非功能正確性、失敗場景或外部依賴整合。
- 若按現況直接上線，最主要風險是「假正常運行」：流程看似可走通，但實際任務執行、模型推理、錯誤恢復並未落地。

## 4. 建議優先改善項目

1. 將 `BaseSession.tick()` 從「模擬成功」改為真實執行工具/Agent 交付。
2. 完成 `CoordinatorAgent.planTaskGraph()`，讓目標可自動轉換為可調度任務。
3. 讓 `InferenceEngine` 真實更新 Agent 狀態與消息歷史，而非僅停留在註解描述。
4. 用真實工具或可替代的執行引擎替換現有 `Mock*` 測試，讓整合測試覆蓋完整運行時路徑。
5. 增加 `AgentRegistry` 配置範例與 JSON schema，消除動態載入的隱性依賴。
6. 強化 Guardian 的錯誤分類與恢復策略，避免未分類錯誤被忽略。
7. 加入 `exportLog()` 的實作與快照恢復測試，確保可觀測性與可回溯性。

## 5. 特別註明

- 本報告已將所有「模擬」相關說明視為未實作缺口。
- 若要達到工業化品質，應優先將「模擬驗證」轉為「真實執行」並補強上述缺口。

## 6. ARCH.md 與原始碼對照結果

### 6.1 已實作或部分實作的架構目標

- `GlobalRuntime`：已實作核心循環與 session tick 調用。
- `AgentRegistry`：已實作註冊、查詢、JSON 載入流程。
- `SessionManager`：已實作 Session 创建、恢复、活動會話查詢。
- `EventBus`：已實作 publish/subscribe/unsubscribe。
- `TaskGraph` / `ParallelScheduler` / `ReadyQueue`：已實作 DAG 調度邏輯。
- `MiddlewareChain`：已實作中間件串接機制。
- `BaseAgent` / `CoordinatorAgent` / `BaseTool` / `ToolRegistry` / `Guardian`：有基本雛形實作。
- `FileSnapshotManager`：已實作快照與回滾。

### 6.2 ARCH.md 中但原始碼未完成的目標

- `SystemScopeManager`：原始碼中不存在該組件。
- `EventStore`：缺少持久化事件存儲層。
- `ToolRuntime`：未見獨立的工具執行層封裝。
- `HookRegistry` / `HookEngine`：缺乏實作。
- `MutationPolicy` / `MutationBuffer`：無實作。
- `ScopeRules` / `HookCompiler` / `DomainPolicy`：Vertical System 相關功能未完成。
- `TraceContext` / `Router` / `Inbox` / `Outbox` / `SessionMessageFilter`：通信與觀測性框架未實作。
- `RootAgent` / `ManagerAgent` / `WorkerAgent` 的專業化實作：接口存在，但具體執行類別缺乏。
- `MutationRequest` 完整流程：缺少 MutationValidator、裁決後應用與 Hook 修改。
- `OpLog` 壓縮摘要：接口存在，無實際實現。
- `ExecutionPhase` 真實意圖執行流程：Session tick 仍偏向模擬，不包含 Middleware+Tool+PostExecution 真實鏈路。
- `Recovery Phase` 自動回滾：快照實作存在，但缺少不可修復錯誤觸發機制。

### 6.3 立刻可見的架構不一致

- ARCH.md 描述的核心系統數量遠超過已落地的實作：許多系統仍僅停留在接口/文件規劃階段。
- 原始碼中多處流程只做「模擬」或「登錄」而非真正執行，尤其是 Session 執行、Agent 分配、事件驅動、Hook/Mutation 流程。
- 這意味著目前系統更像是「調度框架樣板 + 模擬執行算法」，而非可直接運行的工業級 AI 執行時。

### 6.4 建議補件順序

1. 補足 `HookRegistry` / `MutationPolicy` / `MutationValidator`，讓事件與狀態變更流程可落地。
2. 完成 `WorkerAgent` / `RootAgent` / `ManagerAgent` 等角色實作，補齊 Agent 執行層。
3. 用 `Router` + `TraceContext` 連接跨 Agent / Session 通信，實現可觀測性。
4. 將 `BaseSession.tick()` 真正接入 `ToolRuntime` 與 `Guardian`，而非單純模擬成功。
