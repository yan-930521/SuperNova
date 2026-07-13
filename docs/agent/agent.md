# Agent 系統設計 (Agent System Design)

本系統將 Agent 的生命週期與存在型態進行嚴格區分，賦予其具備「具身智能 (Embodied AI)」的擴展能力，實現純邏輯運算與實體/虛擬環境互動的解耦。

## 1. Agent 生命週期與型態分類 (Agent Types)

根據「存在週期」與「是否具備形體」，系統中的 Agent 分為以下三大類：

### A. `MainAgent` (永久型 / 無形體)
*   **定義**：系統的中樞大腦 (Brain in a Vat) 與全局管理者。
*   **職責**：全局任務分派、長期記憶與上下文快照管理、生命週期管理 (GC)。
*   **特權 (Privileges)**：具備「上帝視角 (God Mode)」。作為最高管理者，它可以跨越層級，無限制地存取、監控、查詢甚至介入全系統中所有運作中的 `SubAgent`、`EmbodiedAgent` 以及底層的 `Worker`。
*   **特徵**：長期存在，但**拒絕注入任何 `Body`**。純粹處理高階邏輯與路由，接收下級回報的結構化結果 (`Deep Merge`)。

### B. `SubAgent` (暫時型 / 無形體)
*   **定義**：為了解決特定任務而動態生成的邏輯控制單元 (PDCA 協調者)。
*   **職責**：擔任 PDCA 循環的大腦 (LLM 作為 CPU)。負責針對單一任務拓撲圖進行規劃 (Plan)、檢視 (Check)、決策修正 (Act)。
*   **特徵**：採用 **延遲釋放 (Lazy GC / Warm Start)** 機制。任務完成並匯總結果後，實體不立刻銷毀，而是清除短期任務記憶並進入 `IDLE` 狀態 (預設 TTL 為 5 分鐘)。若期間有同類型任務，則直接「溫啟動」以節省 Token 成本與冷啟動延遲；若超時未被喚醒，才由系統自動回收 (GC)。

### C. `EmbodiedAgent` (永久型 / 有形體)
*   **定義**：長期存在於特定環境（現實機器人或虛擬世界角色）的具身智能實體。
*   **職責**：負責與特定環境進行持續性的互動、感知與執行。
*   **特徵**：長期存在（不會被任務級別的 GC 銷毀），並且**必須被強制注入一個 `Body` (形體)** 組件。

---

## 2. 具身智能：`Body` 注入機制 (Body Injection)

為了讓 `EmbodiedAgent` 的「靈魂 (LLM 邏輯)」與「肉體 (環境接口)」解耦，系統採用依賴注入模式。`Body` 組件包含以下三大核心元素，會在 Agent 啟動或運行時動態注入：

*   **`EnvPrompt` (環境上下文提示詞)**：
    *   代表角色的**「感知」**。
    *   內容包含動態描述當前的物理或虛擬狀態（如：周圍環境描述、天氣、視覺辨識結果）。這段 Prompt 會在每一輪對話被強制注入到 Agent 的上下文中，確保其行為符合環境現況。
*   **`ActionTools` (環境特定工具集)**：
    *   代表角色的**「四肢」**。
    *   提供專屬於該環境的可用 Tool API 邊界（例如：機械手臂的 `move_joint()`、遊戲中的 `walk_to(x, y)` 或 `speak()`）。限制 Agent 只能做出符合物理法則的操作。
*   **`PhysicalState` (肉體狀態變數)**：
    *   儲存與環境綁定的生命週期狀態，如：三維座標 (Location)、生命值 (HP)、電量/能量 (Energy) 等。

---

## 3. 代理層 PDCA 交互流程 (Data Flow)
*(以 `SubAgent` 處理任務為例)*

1. **Plan (規劃)**
   * `SubAgent` 被喚醒，分析任務，調用 `create_task_graph` 生成 `TaskDAG`。
   * 將 `TaskDAG` 提交給 `DAGScheduler`。`ContextManager` 寫入受保護的 `Init_Target` 日誌。
2. **Do (執行)**
   * `SubAgent` 調用 `dispatch_workers(wait_mode="ALL")`，隨後進入非同步掛起，停止消耗 Token。
   * `DAGScheduler` 根據拓撲圖自動解析依賴，透過 `EventBus` 並發派發對應的 `Worker`。
3. **Check (檢視)**
   * `Worker` 執行完畢（或 `DAGScheduler` 觸發 Timeout 異常）。
   * `EventBus` 將結果封裝為 `DataBlock` 送入 `InboxBuffer`，並喚醒 `SubAgent`。
   * 若存在異常結果，`ContextManager` 自動觸發 Hot-Lock 鎖定現場。
4. **Act (修正與收尾)**
   * `SubAgent` 調閱 Oplog 與 Buffer 內容，進行冷靜決策。
   * 若需修正，呼叫 `patch_task_graph` 動態增刪改 DAG 節點，重新進入 Do 循環。
   * 若任務完全成功，將最終狀態 Deep Merge 回 `MainAgent`。
   * **清理與閒置 (Lazy GC)**：系統解除該任務的 `Workspace` 與 `Oplog` 綁定 (執行嚴格的記憶擦除)，將該 `SubAgent` 切換至 `IDLE` 狀態並啟動 TTL 倒數計時。若超時則執行最終實體銷毀。

---

## 4. 指令集與 Prompt 規範 (Prompt as ISA)
將 `Prompt` 視為驅動無形體 `SubAgent` 的指令集。Prompt 中必須明確約定 PDCA 各個狀態的行為準則與嚴格約束：
*   **【PLAN 規範】**：初始化後必須先調用工具建立 `TaskDAG`，不得直接執行操作。
*   **【DO 規範】**：拓撲圖就緒後，僅能下達並發指令並進入掛起狀態。
*   **【CHECK 規範】**：喚醒後，強制要求比對 `DataBlock` 與 `Oplog` 中的預期目標。嚴禁在此階段臆測外部狀態。
*   **【ACT 規範】**：遭遇錯誤時，依賴被鎖定的完整上下文進行反思，並調用修補工具；連續失敗超出上限則必須通報。

---

## 5. 高階擴展與併發模型 (Advanced Scaling Models)

為了解決大數據處理與巨型專案維護的擴展性瓶頸，系統支援兩種不同維度的 Agent 擴展模型：

### A. 樹狀派生模式 (主動派生 - Fractal Delegation)
*   **適用場景**：處理極度複雜、需要大量思考與拆解的單一巨型任務（例如：維護擁有 500 個模組的專案）。
*   **運作機制**：`SubAgent` 不僅能呼叫無狀態的 `Worker`，也能在 `[DO]` 階段主動調用系統 API **派生出下層的 `SubAgent`**。這讓架構形成動態的「樹狀階層」：上層 SubAgent 轉型為領域主管（僅負責切割領域與審查報告），下層 SubAgent 在各自獨立的 Git 分支 (由 `WorkspaceManager` 隔離) 中進行實體修改，最終透過非同步審查進行 Merge。這徹底解決了 `MainAgent` 作為單一中樞的 Context 爆炸問題。

### B. 分身併發模式 (被動擴展 - Auto-Concurrency / Clone Mode)
*   **適用場景**：系統被動遭遇突發且大量的「同性質事件」（例如：Discord 機器人同時收到 100 人的詢問，或監控系統同時湧入 500 筆 Error Log）。
*   **運作機制**：這是底層 `EventBus` 與 `InboxBuffer` 提供的自適應流量防禦機制。當偵測到特定 Agent 的負載過高時，系統不會讓所有訊息在單一 Agent 的信箱排隊並污染上下文，而是**自動派生出多個與原 Agent 擁有完全相同「大腦」(Prompt 與 Tools) 的「分身 (Clones)」**。這些分身併發消化 DataBlock，處理完畢後分身隨即消散 (GC)。完美實現了類似 Serverless 的水平無縫擴容。
