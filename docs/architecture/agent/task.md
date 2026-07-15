---
title: 任務系統規範
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes: []
related_docs:
  - ../../ARCH.md
  - ./agent.md
  - ./worker.md
  - ../core/memory.md
---

# SuperNova 任務系統規範 (Task System Specification)

本文件定義了 SuperNova 系統中最小的執行與排程單位 —— `Task`（任務）與其依賴拓撲結構 `TaskDAG`（任務有向無環圖）的資料模型與交互設計。

任務不僅是單純的指令字串，而是具備「計畫」、「評測標準」、「狀態追蹤」、「工作區管理」與「排程控制」的結構化物件，是支撐 `SubAgent` 進行 PDCA (Check 階段) 驗證與 EventBus 非同步排程的核心依據。

本系統嚴格遵循「控制面與資料面分離」與「組態驅動 (Config-driven)」原則，以 `DataBlock` 作為任務間結果流轉的唯一載體，所有實體檔案路徑與限制均透過 Config 進行動態解析，拒絕任何代碼硬編碼。

---

## 1. 核心資料模型 (Core Data Models)

### 1.1. TaskState (任務狀態)
任務在生命週期中的狀態流轉定義如下：
*   `PENDING`：初始狀態，等待所有前置依賴完成。
*   `RUNNING`：已被排程器派發，Worker 正在執行。
*   `SUCCESS`：執行成功，且已綁定輸出結果 `DataBlock`。
*   `FAILED`：執行失敗且無法繼續重試。
*   `BLOCKED`：前置依賴任務失敗/被阻礙，導致本任務無法執行（級聯傳播）。
*   `CANCELLED`：受外部信號終止而取消。

### 1.2. Task 欄位結構 (Task Schema)
一個完整的 Task 實體（類別實作於 `src/core/task/Task.ts`）包含以下資料維度：

#### A. Identity & Routing (識別與路由)
*   `id`: `string`
    *   *說明*：全局唯一識別碼（預設自動生成），用於 EventBus 路由與 DAG 依賴追蹤。
*   `sessionId`: `string`
    *   *說明*：所屬的 Session ID，用於會話綁定。
*   `title`: `string`
    *   *說明*：任務的簡短名稱/摘要。
*   `description`: `string`
    *   *說明*：任務的詳細意圖、背景脈絡與步驟指引。
*   `targetRole?`: `string`
    *   *說明*：目標執行 Worker 的角色名稱。當需要「隨便找一個閒置 Worker 處理」時使用（例如：指定為 `WebCrawler`，由 EventBus 負載均衡派發至 Worker Pool）。
*   `targetId?`: `string`
    *   *說明*：目標特定執行實體 ID。當需要「精確指定特定對象」時使用（例如：指定為 `DiscordBot_01`，進行 P2P 點對點傳遞）。
    *   *(註：`targetRole` 與 `targetId` 通常擇一使用)*

#### B. Plan, Intent & Evaluation (計畫、意圖與評測)
*   `executionPlan?`: `string | string[]`
    *   *說明*：具體的執行步驟建議或 SOP。由上級 Agent 拆解提供，指導下級執行者如何推進。
*   `acceptanceCriteria?`: `string[]`
    *   *說明*：驗收條件清單。在 PDCA 的 `[CHECK]` 階段，SubAgent 必須嚴格依據此欄位與執行結果進行比對，作為任務是否成功的絕對標準，有效防止 LLM 在驗收時產生幻覺（例如：「回傳資料必須包含 user_id」、「API 響應時間需小於 1s」）。

#### C. Progress & Status (實現進度與狀態)
*   `status`: `TaskState`
    *   *說明*：當前任務狀態，預設為 `PENDING`。
*   `progressNote?`: `string`
    *   *說明*：動態進度描述。用於長時間運行的任務，執行者可中途發送 `DataBlock` 更新此欄位（例如："已處理 50/100 筆資料"），讓排程器與上級 Agent 掌握實時進度。

#### D. Scheduling & Control (排程控制)
*   `priority`: `number`
    *   *說明*：派發優先度，決定 `DAGScheduler` 或 `EventBus` 派發資源的先後順序。數值越大越優先，預設為 `0`。
*   `timeoutMs`: `number`
    *   *說明*：單次執行超時限制（毫秒），超時將觸發強制中斷。若為 `0` 則套用系統預設安全限制 `config.security.default_task_timeout_ms`。
*   `isIdempotent`: `boolean`
    *   *說明*：是否具備冪等性標記。宣告該任務是否可以安全地重複執行（例如：純讀取的 GET 請求為 `true`，而 POST 寫入/匯款則為 `false`）。若為 `true` 允許自動重試。
*   `maxRetries`: `number`
    *   *說明*：最大自動重試次數。若未指定，預設載入 `config.security.default_task_max_retries`。
*   `retryCount`: `number`
    *   *說明*：當前已重試次數，預設為 `0`。
*   `retryDelayMs?`: `number`
    *   *說明*：重試延遲時間。若遭遇網路波動等暫時性錯誤，且 `isIdempotent` 為真，底層 `DAGScheduler` 會在延遲後自動重試，直到次數耗盡才回報失敗。若未指定，預設載入 `config.security.default_task_retry_delay_ms`。

#### E. Workspace Settings (工作區配置)
*   `workspaceType?`: `'VOLATILE' | 'PERSISTENT'`
    *   *說明*：指派的工作區類型。
*   `workspacePath?`: `string`
    *   *說明*：由 `WorkspaceManager` 解析的實際工作區目錄，包含 VFS 掛載或實體 Git worktree 路徑。

#### F. Data & Dependency (資料與依賴關係)
*   `dependencies`: `string[]`
    *   *說明*：前置依賴的 Task ID 陣列。必須等這些任務狀態為 `SUCCESS`，此任務才能進入 `RUNNING`。
*   `inputContext`: `Record<string, any>`
    *   *說明*：本任務的輸入參數。支援模板語法（Template Syntax）進行動態映射綁定（例如：`{ "url": "${Task_A.output.article_url}" }`）。`DAGScheduler` 會在 Task A 完成後，自動將結果映射替換到 Task B 中，無需喚醒 `SubAgent` 介入資料傳遞。
*   `output?`: `DataBlock`
    *   *說明*：成功後產出的結果 `DataBlock` 實體，包含 `controlPayload` 與 `dataPointers`，作為任務間結果流轉的唯一載體。

---

## 2. TaskDAG 任務有向無環圖 (TaskDAG)

`TaskDAG` 類別（實作於 `src/core/task/TaskDAG.ts`）負責管理多個任務節點及其有向依賴邊，主要機制如下：

*   **邊定義 (IGraphEdge)**：
    `{ sourceId: string; targetId: string }`（代表 `sourceId` 的任務依賴於 `targetId` 的任務）。
*   **無環驗證 (validate)**：
    整合 `GraphValidator.validate` 進行檢測，若發現循環依賴、孤立邊（Dangling）或無關聯孤兒節點則拋出例外，確保拓撲結構合法。
*   **就緒節點解析 (getReadyTasks)**：
    篩選出所有狀態為 `PENDING` 且其所有依賴（`dependencies`）在圖中狀態均為 `SUCCESS` 的 Task 節點。
*   **失敗級聯傳播 (Cascade Blocking)**：
    當某個 Task 更新為 `FAILED` 狀態且無法再重試時，排程器會呼叫此方法將其在 DAG 中的所有下游相依任務遞迴更新為 `BLOCKED`，避免無效執行。

---

## 3. 去硬編碼與 Config 驅動設計 (Config-driven Design)

為確保資料存取靈活性與系統安全性，所有預設引數與工作區根路徑均透過系統 Config 讀取，拒絕硬編碼：

*   **工作區路徑動態解析**：
    *   **虛擬掛載點**：`VOLATILE` 模式下，實際工作區路徑會被解析為 `${config.storage.vfs_base_dir}/${id}`，而非硬編碼。
    *   **實體 Git 目錄**：`PERSISTENT` 模式下，路徑會解析為 `path.join(basePersistentPath, config.storage.worktree_dir, id)`，支援動態 Git worktree 隔離。
*   **任務默認安全邊界**：
    *   在 `Task` 實例初始化時，若 `timeoutMs`、`maxRetries` 或 `retryDelayMs` 參數未指定，系統會自動載入：
        *   `config.security.default_task_timeout_ms`
        *   `config.security.default_task_max_retries`
        *   `config.security.default_task_retry_delay_ms`

---

## 4. 資料流與事件交互 (Data Flow & Event Interaction)

本系統以 `DataBlock` 作為唯一資料流媒介，任務間資料依賴傳遞由排程器自動完成：

### 4.1. 任務派發 (TASK_DISPATCH)
當排程器篩選出就緒的任務並準備指派時，會向對應的 Worker 發送 `TASK_DISPATCH` 事件，其 payload 結構如下：
```json
{
  "task": { ...Task 欄位結構... },
  "parentOutputs": [ ...依賴任務所產出的 DataBlock 陣列... ]
}
```

### 4.2. 資料提取
後置任務的 Worker 可以直接從 `parentOutputs` 的各個 `DataBlock` 中，以程式代碼讀取需要的控制變數或 `dataPointers` 中的 VFS/File 路徑，無須任何複雜的字串模板解析引擎。

### 4.3. 完成與收集 (TASK_SUCCESS / TASK_ERROR)
*   **TASK_SUCCESS**：Worker 成功完成任務後，回傳成功事件與產出的 `DataBlock`。排程器接收後更新 Task 狀態為 `SUCCESS` 並綁定至 `output`，隨後推動下一輪就緒節點排程。
*   **TASK_ERROR**：Worker 執行失敗時回傳錯誤事件。排程器將根據 `isIdempotent` 與重試設定進行自動重試；若重試次數耗盡，則更新狀態為 `FAILED` 並觸發下游任務的級聯傳播（`BLOCKED`）。

---

## 5. 任務與 PDCA 循環的整合機制

任務系統是支撐 `SubAgent` 運作 PDCA 循環的核心基礎：

1.  **[PLAN] 創建與綁定**：
    `SubAgent` 呼叫工具生成 Task 物件並建構 DAG。此時會利用模板語法定義 `inputContext` 解決資料依賴傳遞，並設定 `isIdempotent` 與 `maxRetries` 卸載底層排錯壓力。
2.  **[DO] 自動流轉與中斷 (Abort Signal)**：
    `DAGScheduler` 開始託管 DAG 圖。
    *   若任務正常，資料與狀態會隨著 DAG 節點自動流轉。
    *   若外部（如 MainAgent）決定放棄任務，或觸發了 `timeoutMs`，`EventBus` 具備向特定正在運行的 Worker 發送 **`AbortSignal` (中斷信號)** 的能力，強制終止執行。
3.  **[CHECK] 嚴格驗收**：
    只有在任務完全成功，或者耗盡了所有底層自動重試次數後，`SubAgent` 才會被喚醒，並以 `acceptanceCriteria` 進行最終判決。這有效防止 LLM 在驗收時產生幻覺。
4.  **[ACT] 高階修正**：
    若任務最終為 `FAILED` 且底層重試失效，`SubAgent` 將被喚醒進行高階邏輯決策（如：修改執行計畫、重構搜索關鍵字、重新拆解任務，或向上級回報失敗）。
