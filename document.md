# SuperNova 深度開發手冊 (Technical Deep-Dive & API Manual)

本文件為 SuperNova 框架的權威技術指南，旨在協助開發者與 AI Agent 深入理解系統核心機制，並能基於此框架快速構建複雜的領域應用（如心理諮商、營養管理）。

---

## 1. 系統架構深鑽 (Architecture Deep-Dive)

### 1.1 執行時模型 (Runtime Model)
SuperNova 採用 **「中心化調度、去中心化執行」** 的架構：
- **GlobalRuntime**: 系統總管，負責啟動/停止基礎設施（EventBus, SessionManager, AgentRegistry）。
- **BaseSession**: 執行邊界。每個 Session 擁有獨立的 `TaskGraph`、`ReadyQueue` 與 `scheduler`。
- **AgentRegistry**: 動態載入中心。支援從 JSON 序列化數據恢復 Agent 狀態，實現「無狀態 Agent」設計。

### 1.2 任務依賴與調度 (Task Scheduling)
- **TaskGraph (DAG)**: 核心算法。使用「入度 (In-degree) 遞減」算法。當一個任務的前置依賴全部 `completed` 時，該任務進入 `ReadyQueue`。
- **ParallelScheduler**: 觀察者模式。每當 `tick()` 觸發時，調度器會掃描 `TaskGraph` 並將就緒任務推入隊列。

---

## 2. API 詳細參考 (Detailed API Reference)

### 2.1 Agent 系統
#### `IAgent` 介面
```typescript
interface IAgent {
  readonly id: string;
  readonly role: string;
  readonly capabilities: string[];
  isReady(): boolean; // 檢查引擎 (ReAct/Fallback) 是否就緒
  processTask(taskNode: ITaskNode): Promise<any>; // 核心執行進入點
  toJSON(): Record<string, any>; // 用於快照持久化
}
```
- **建立 Worker**: 繼承 `BaseAgent` 並實作 `processTask`（或直接使用內建的 `WorkerAgent` 提供 ReAct 能力）。
- **建立 Coordinator**: 必須實作 `planTaskGraph(goal: string)`，返回一個具備依賴關係的任務圖。

### 2.2 任務上下文 (Task Context)
#### `ITaskNode` 與 Context 注入
```typescript
interface ITaskNode {
  id: string;
  goal: string;
  dependencies: string[]; // 前置任務 ID
  result?: any;           // 存儲執行結果
  metadata: {
    parentContext: Record<string, any>; // 格式: { "task_id_1": "result_content" }
    sessionGoal: string;                // 原始全局目標
  };
}
```
**注入機制**：`BaseSession` 在派發任務前，會自動回溯其 `dependencies` 並從 `taskResults` 緩存中取出結果，注入到 `metadata.parentContext`。

### 2.3 基礎設施服務
- **IToolRegistry**: `register(tool: ITool)`。所有 Worker 共享工具池。
- **IGuardian**: `protect(task, timeout)`。封裝異步任務，提供超時熔斷與異常隔離。
- **ILogger (LogManager)**: 全局統一的日誌進入點。
  - **分級**: `DEBUG`, `INFO`, `WARN`, `ERROR`。
  - **Transport**: 支援 `Console` (控制台顯示) 與 `File` (JSONL 檔案存儲)。
  - **自動分類**: 凡帶有 `session_id` 的日誌均會自動寫入 `workspace/logs/{session_id}.jsonl`。
- **ISnapshotManager**: `snapshot(session, metadata)`。將整個 Session 的狀態（含 Agent 內部數據）持久化。

---

## 3. 領域開發實戰 (Domain Implementation Patterns)

### 3.1 增加「營養學」工具 (Example)
1. **定義工具**: 建立 `NutritionSearchTool` 實作 `ITool`。
2. **Schema 定義**: 使用 `zod` 定義精確的輸入，如 `food_name: z.string()`。
3. **注入上下文**: 利用 `IToolContext` 獲取 `sessionId`，以便查詢該使用者的歷史過敏記錄。

### 3.2 增加「心理諮商」同理心組件
1. **自定義 Middleware**: 在 `BaseSession` 註冊一個 `Post-Execution Middleware`。
2. **行為**: 每當 Worker 完成對話，Middleware 調用 `EvaluatorAgent` 對內容進行「情緒支持得分」評估。
3. **Mutation**: 若得分過低，Middleware 發起一個 `MutationRequest` 修改接下來任務的 System Prompt，要求「加強同理心語氣」。

---

## 4. 關鍵配置與開發規範

### 4.1 Agent 配置 (JSON)
- **`availableAgents`**: 這是 `COORDINATOR` 的**必填項**。它決定了規劃器在拆解任務時，可以考慮哪些專家 ID。
- **`prompts.identity`**: 可以是字串，或指向 `./prompts/` 下的 `.md` 路徑。

### 4.2 開發規範
- **日誌**: 必須包含 `[ClassName]` 前綴，訊息使用英文。
- **註解**: 邏輯複雜處必須使用中文註解說明意圖。
- **異步處理**: 嚴禁使用未受 `Guardian` 保護的長時異步調用。

---

## 5. 快速開發 Demo 流程

1. **定義需求**: 在 `agents/` 下定義新的角色 JSON。
2. **註冊工具**: 在 `scripts/run-demo.ts` 的 `C` 區塊註冊新工具。
3. **編寫目標**: 修改 `runDemo()` 中的 `goal` 字串。
4. **觀察執行**:
   - 關注控制台 `[BaseSession] Delegating...` 日誌，確認任務是否分發正確。
   - 檢查 `workspace/` 下生成的成果物內容是否符合預期。

---

*此文件由 SuperNova 自動更新，最後修訂時間：2026-05-15。*
