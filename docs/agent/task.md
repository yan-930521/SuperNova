# SuperNova 任務系統規範 (Task System Specification)

本文件定義了 SuperNova 系統中最小的執行與排程單位 —— `Task`（任務）的資料結構與生命週期。
任務不僅是單純的指令字串，而是具備「計畫」、「評測標準」、「狀態追蹤」與「排程控制」的結構化物件，是支撐 `SubAgent` 進行 PDCA (Check 階段) 驗證的核心依據。

## 1. 任務核心資料結構 (Task Schema)

一個完整的 `Task` 物件包含以下六大維度：

### A. 基本識別與路由 (Identity & Routing)
*   `task_id` (String): 全局唯一識別碼，用於 EventBus 路由與 DAG 依賴追蹤。
*   `title` (String): 任務的簡短摘要名稱。
*   `target_role` (String - Optional): **目標角色/類型**。當需要「隨便找一個閒置 Worker 處理」時使用（例如：指定為 `WebCrawler`，由 EventBus 負載均衡派發至 Worker Pool）。
*   `target_id` (String - Optional): **目標特定實體 ID**。當需要「精確指定特定對象」時使用（例如：指定為 `DiscordBot_01`，進行 P2P 點對點傳遞）。
*(註：`target_role` 與 `target_id` 通常擇一使用)*

### B. 計畫與意圖 (Plan & Intent)
*   `description` (String): 任務的背景脈絡與總體目標。
*   `execution_plan` (String / Array): 具體的執行步驟建議或 SOP。由上級 Agent 拆解提供，指導下級執行者如何推進。

### C. 評測標準 (Evaluation Criteria)
*   `acceptance_criteria` (Array[String]): **驗收條件清單** (可選)。
    *   *說明*：例如「回傳資料必須包含 user_id」、「API 響應時間需小於 1s」。
    *   *作用*：在 PDCA 的 `[CHECK]` 階段，SubAgent 必須嚴格依據此欄位與執行結果進行比對，作為任務是否成功的絕對標準，有效防止 LLM 在驗收時產生幻覺。

### D. 實現進度與狀態 (Progress & Status)
*   `status` (Enum): 當前任務狀態 (`PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `BLOCKED`, `CANCELLED`)。
*   `progress_note` (String): **動態進度描述**。
    *   *說明*：用於長時間運行的任務。執行者可中途發送 DataBlock 更新此欄位（例如："已處理 50/100 筆資料"），讓排程器與上級 Agent 掌握實時進度。

### E. 排程與控制 (Scheduling, Retry & Abort)
*   `priority` (Integer / Enum): **優先級**。決定 `DAGScheduler` 或 `EventBus` 派發資源的先後順序。
*   `timeout_ms` (Integer): **時間限制 (TTL)**。超時將觸發強制中斷。
*   `is_idempotent` (Boolean): **冪等性標記**。宣告該任務是否可以安全地重複執行（例如：純讀取的 GET 請求為 `true`，而 POST 寫入/匯款則為 `false`）。
*   `max_retries` (Integer): **最大自動重試次數**。
*   `retry_delay_ms` (Integer): **重試延遲時間**。
    *   *作用*：若 `is_idempotent` 為真，遭遇網路波動或 Rate Limit 等暫時性錯誤時，底層 `DAGScheduler` 會直接進行自動重試，直到次數耗盡才會真正喚醒 LLM 進行 `[ACT]`，藉此大幅節省 Token 與通訊成本。

### F. 依賴與動態資料綁定 (Dependencies & Dynamic Context)
*   `dependencies` (Array[String]): 依賴的前置 `task_id` 陣列。必須等這些任務狀態為 `SUCCESS`，此任務才能進入 `RUNNING`。
*   `input_context` (Object): 執行此任務所需的必備參數。**支援模板語法 (Template Syntax) 進行動態綁定**。
    *   *作用*：例如設定 Task B 的輸入為 `{ "url": "${Task_A.output.article_url}" }`。`DAGScheduler` 會在 Task A 完成後，自動將結果映射替換到 Task B 中，無需喚醒 `SubAgent` 介入資料傳遞。
*   `output_result` (Object): 任務完成後，存放實際產出資料的欄位。

---

## 2. 任務與 PDCA 循環的整合機制

1.  **[PLAN] 創建與綁定**：`SubAgent` 呼叫工具生成 Task 物件。此時會利用模板語法定義 `input_context` 解決依賴傳遞，並設定 `is_idempotent` 與 `max_retries` 卸載排錯壓力。
2.  **[DO] 自動流轉與中斷 (Abort Signal)**：`DAGScheduler` 開始託管 DAG 圖。
    *   若任務正常，資料會隨著 DAG 節點自動流轉。
    *   若外部（如 MainAgent）決定放棄任務，或觸發了 `timeout_ms`，`EventBus` 具備向特定正在運行的 Worker 發送 **`AbortSignal` (中斷信號)** 的能力，強制終止執行。
3.  **[CHECK] 嚴格驗收**：只有在任務完全成功，或者耗盡了所有底層自動重試次數後，`SubAgent` 才會被喚醒，並以 `acceptance_criteria` 進行最終判決。
4.  **[ACT] 高階修正**：進入此階段代表底層已經無能為力，`SubAgent` 將進行高階邏輯決策（如：修改執行計畫、重構搜索關鍵字、或回報失敗）。
