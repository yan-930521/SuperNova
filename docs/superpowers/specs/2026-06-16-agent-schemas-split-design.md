# Agent Schemas 職責拆分設計 (Agent Schemas Split Design)

## 1. 背景與動機 (Background)
目前的 `src/schemas/agent/AgentOutputSchemas.ts` 檔案過於龐大，包含了所有 Agent 角色的輸出定義。隨著系統演進，單一檔案維護變得困難，且不同 Agent 之間的依賴關係不明確。為了符合 SuperNova 的專業角色分工原則，我們需要將這些 Schemas 依照代理角色進行拆分。

## 2. 現狀分析 (Current Analysis)
現有的 `AgentOutputSchemas.ts` 包含以下邏輯塊：
- 思維生成與評價 (Thought Gen/Eval)
- 全局相位規劃 (Global Phase Graph)
- 局部任務規劃 (Local Task Graph)
- 規劃管線中間產物 (Goal Analysis, Decomposition, etc.)
- 路由決策 (Routing Decision)
- 換檔決策 (Escalation Decision)
- 事實沉澱 (Reflection)
- 質量檢核 (Check)

## 3. 目標架構 (Proposed Architecture)

我們將 Schemas 拆分為以下模組：

### 3.1 `PlanningSchemas.ts` (對應 PlanningAgent)
專注於任務拆解與圖形生成。
- `PhaseNodeSchema`
- `GlobalPhaseGraphSchema`
- `WorkNodeSchema`
- `LocalTaskGraphSchema`
- `GoalAnalysisSchema`
- `DecompositionSchema`
- `DependencyInferenceSchema`
- `VerificationBindingSchema`
- `PlanningRefinementSchema`

### 3.2 `ActingSchemas.ts` (對應 ActingAgent / DoingAgent)
專注於執行過程中的事實沉澱與反思。
- `ReflectionSchema` (原事實沉澱 Schema)

### 3.3 `CheckingSchemas.ts` (對應 CheckingAgent)
專注於質量檢核與驗證。
- `CheckSchema`

### 3.4 `SupervisingSchemas.ts` (對應 SupervisorAgent)
專注於編排中樞的決策模組。
- `RoutingDecisionSchema`
- `EscalationDecisionSchema`

### 3.5 `CommonSchemas.ts` (通用/基礎思維)
所有代理共用的思維基礎 Schema。
- `ThoughtBranchSchema`
- `ThoughtGenResponseSchema`
- `EvaluationResultSchema`
- `ThoughtEvalResponseSchema`

### 3.6 `index.ts` (入口統整)
提供統一的匯出接口，保持與舊代碼的相容性（可選擇性使用）。

## 4. 依賴變動 (Dependency Changes)
- `src/agent/roles/PlanningAgent.ts` 將匯入 `PlanningSchemas.ts`
- `src/agent/roles/ActingAgent.ts` 將匯入 `ActingSchemas.ts`
- `src/agent/roles/CheckingAgent.ts` 將匯入 `CheckingSchemas.ts`
- `src/agent/roles/SupervisorAgent.ts` 將匯入 `SupervisingSchemas.ts`

## 5. 驗證標準 (Success Criteria)
1. 所有檔案皆能正常通過 TypeScript 編譯。
2. 匯入路徑清晰，無循環依賴。
3. `AgentOutputSchemas.ts` 被成功移除。
