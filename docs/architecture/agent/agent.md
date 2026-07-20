---
title: Agent 系統設計
version: 0.1.0
status: APPROVED
last_updated: 2026-07-20
author: Antigravity & User
related_codes: []
related_docs:
  - ../../ARCH.md
  - ./worker.md
  - ./task.md
---

# Agent 系統設計 (Agent System Design)

本系統將 Agent 的生命週期與存在型態進行嚴格區分，賦予其具備「具身智能 (Embodied AI)」的擴展能力，實現純邏輯運算與實體/虛擬環境互動的解耦。同時，系統的底層基石建立在純粹化、去業務邏輯的 `BaseAgent` 之上。

## 1. 基礎代理類別 (BaseAgent) 的基礎設施層

所有系統中的 Agent (`MainAgent`, `SubAgent`, `EmbodiedAgent`) 皆繼承自 `BaseAgent`。`BaseAgent` 的職責被嚴格限縮於**「提供穩定的底層基礎設施與資源隔離」**，完全剝離具體的業務邏輯 (如 PDCA 循環或與 LLM 的網路通訊)。
*   **型態與擴展性聲明**：實體強制聲明其 `type: AgentType` (如 MAIN, SUB, EMBODIED 等) 並聲明 `canClone: boolean` 以決定其是否支援在突發高負載下被「分身併發模式 (Auto-Concurrency)」動態擴展。

*   **會話與基礎設施綁定**：建構時強制要求綁定 `sessionId`。所有由此對話衍生派生出的 `SubAgent` 與 `Worker` 都強制依附於此 Session 中運行。透過設定 `WorkspaceType` 決定 Agent 使用 `VOLATILE` (虛擬/記憶體) 或 `PERSISTENT` (實體/Git) 工作區。運行日誌與防幻覺操作日誌 (Oplog) 將導向會話級別的實體隔離目錄 (`{log_dir}/sessions/{sessionId}/agents/{agent_id}/`)。同時實例化專屬的訊息收件箱 (`InboxBuffer`) 並透過建構子注入 `EventBus` 自動註冊事件監聽。
*   **純粹的生命週期管理**：專注於系統資源與執行狀態管理。定義 `AgentState` 枚舉 (`INITIALIZING`, `IDLE`, `BUSY`, `SUSPENDED`, `TERMINATED`)。系統設計有嚴謹的狀態遷移，例如 `setReady()` 方法由 `AgentManager` 明確標記初始化完成並切換至 `IDLE`。提供 `suspend()`, `resume()`, `destroy()` 狀態控制與資源清理介面。
*   **純粹的狀態匯出與匯入 (解耦)**：`BaseAgent` **不注入**任何 Repository。它只提供 `serialize(): BaseAgentData` 與 `hydrate(data)` 介面，將自身的狀態（包含 Token 消耗、狀態機、**結構化身份設定 Profile**）打包，真正的持久化由外部的 `AgentManager` 負責調度。
*   **結構化大腦設定 (AgentProfile JSON)**：Agent 的核心提示詞不是一段死板的字串，而是一個嚴謹的 JSON 結構 (包含 `roleName`, `objectives`, `constraints`, `contextData` 等)。這讓 Agent 能在執行過程中透過程式化方式動態更新認知，且完美支援脫水序列化。
*   **資源消耗追蹤**：內部維護 `UsageStats` (Token 與執行時間等消耗)，提供 `recordUsage` 讓子類別回報並具備安全閾值告警機制。

## 2. Agent 生命週期與型態分類 (Agent Types)

根據「存在週期」與「是否具備形體」，系統中的 Agent 分為以下三大類：

### A. `MainAgent` (永久型 / 無形體)
*   **定義**：系統的中樞大腦 (Brain in a Vat) 與全局管理者。
*   **職責**：全局任務分派、長期記憶與上下文快照管理、生命週期管理 (GC)。
*   **特權 (Privileges)**：具備「上帝視角 (God Mode)」。作為最高管理者，它可以跨越層級，無限制地存取、監控、查詢甚至介入全系統中所有運作中的 `SubAgent`、`EmbodiedAgent` 以及底層的 `Worker`。
*   **特徵**：長期存在，但**拒絕注入任何 `Body`**。純粹處理高階邏輯與路由，接收下級回報的結構化結果 (`Deep Merge`)。

### B. `SubAgent` (暫時型 / 無形體)
*   **定義**：為了解決特定任務而動態生成的邏輯控制單元 (PDCA 協調者)。
*   **職責**：擔任 PDCA 循環的大腦 (LLM 作為 CPU)。負責針對單一任務拓撲圖進行規劃 (Plan)、檢視 (Check)、決策修正 (Act)。
*   **特徵**：採用 **持久化休眠與 ID 召回 (Dehydrate & Rehydrate / Recall by ID)** 機制。
    *   **資源釋放**：當任務完成、失敗掛起或等待外部事件時，SubAgent 不佔用系統的實際 RAM 記憶體與 CPU 資源。
    *   **持久化存檔**：其操作歷史 (Oplog)、反思記憶 (Context) 與狀態將被完整序列化寫入磁碟 (透過 `BaseAgent.saveState()`)。
    *   **動態召回**：當 EventBus 投遞新事件、重試定時器觸發或上級 MainAgent 指派新工作時，Control Plane 隨時可以透過其唯一 ID 載入狀態並還原（Rehydrate），繼續之前的 PDCA 流程。這在底層提供了極佳的資源效率與彈性。

### C. `EmbodiedAgent` (永久型 / 有形體)
*   **定義**：長期存在於特定環境（現實機器人或虛擬世界角色）的具身智能實體。
*   **職責**：負責與特定環境進行持續性的互動、感知與執行。
*   **特徵**：長期存在（不會被任務級別的 GC 銷毀），並且**必須被強制注入一個 `Body` (形體)** 組件。

---

## 2.5 AgentManager (代理人管理器)
為了落實領域驅動設計 (DDD)，將實體與儲存設施解耦，系統引入 `AgentManager` 負責統籌 Agent 的存活與狀態快照。

*   **實例與依賴**：注入 `IAgentStateRepository` 與 `IEventBus`。內部維護 `activeAgents: Map<string, BaseAgent>` 作為活躍池。
*   **靜態實例化 (Static Instantiation)**：不再依賴手動註冊工廠，而是直接於頂層引入 `MainAgent`, `SubAgent`, `EmbodiedAgent`，根據 `AgentType` 透過 `switch` 判斷並直接 `new` 初始化。架構單純且具備強型別檢查優勢。
*   **脫水與喚醒 (Dehydrate & Rehydrate)**：
    *   `dehydrate(agentId)`：從活躍池取出 Agent，呼叫 `serialize()` 取得狀態快照並交由 Repository 存檔，隨後銷毀實體並釋放記憶體。
    *   `rehydrate(agentId)`：從 Repository 載入狀態，經由 Factory 實例化，並呼叫 `hydrate(data)` 恢復狀態，最後加回活躍池。

---

## 2.8 大腦邏輯與 LLM 串接 (Brain Integration)
為了快速驗證與推動功能開發，系統目前採用務實的串接策略：
*   **結構化認知轉譯**：Agent 在處理信件 (`processInbox`) 時，會在記憶體中將 `AgentProfile` JSON 動態渲染為結構化的 LLM 系統提示詞。
*   **角色認知嚴格劃分**：在組裝給 LLM 的訊息列隊時，嚴格對齊 LangChain 的生態。DataBlock 內部將精準區分角色為 `'human'` (使用者輸入) 或 `'ai'` (系統/代理人回覆)，並自動轉譯為 `HumanMessage` 與 `AIMessage`，徹底解決角色混淆與 LLM 嚴重幻覺問題。
*   **直接整合 LangChain 生態**：我們暫不實作抽象包裹層，而是直接在 Agent 內部整合 `@langchain/core` 等套件。將 `DataBlock` 歷史轉譯為 `BaseMessage` 陣列後直接呼叫模型。
*   **純文字決策 (免 Tools)**：為保持初期架構單純，暫不實作 Tool Calling (Function Calling)。Agent 透過純文字回覆進行思考與交流，結果將被封裝為新的 `DataBlock` 儲存或廣播。
*   *(技術債標記)*：未來待功能驗證穩定後，將會重構抽離出 `ILLMProvider` 包裹層，徹底解除核心對 LangChain 框架的硬耦合。

---

## 3. 具身智能：`Body` 注入機制 (Body Injection)

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

## 4. 代理層 PDCA 交互流程 (Data Flow)
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

## 5. 指令集與 Prompt 規範 (Prompt as ISA)
將 `Prompt` 視為驅動無形體 `SubAgent` 的指令集。Prompt 中必須明確約定 PDCA 各個狀態的行為準則與嚴格約束：
*   **【PLAN 規範】**：初始化後必須先調用工具建立 `TaskDAG`，不得直接執行操作。
*   **【DO 規範】**：拓撲圖就緒後，僅能下達並發指令並進入掛起狀態。
*   **【CHECK 規範】**：喚醒後，強制要求比對 `DataBlock` 與 `Oplog` 中的預期目標。嚴禁在此階段臆測外部狀態。
*   **【ACT 規範】**：遭遇錯誤時，依賴被鎖定的完整上下文進行反思，並調用修補工具；連續失敗超出上限則必須通報。

---

## 6. 高階擴展與併發模型 (Advanced Scaling Models)

為了解決大數據處理與巨型專案維護的擴展性瓶頸，系統支援兩種不同維度的 Agent 擴展模型：

### A. 樹狀派生模式 (主動派生 - Fractal Delegation)
*   **適用場景**：處理極度複雜、需要大量思考與拆解的單一巨型任務（例如：維護擁有 500 個模組的專案）。
*   **運作機制**：`SubAgent` 不僅能呼叫無狀態的 `Worker`，也能在 `[DO]` 階段主動調用系統 API **派生出下層的 `SubAgent`**。這讓架構形成動態的「樹狀階層」：上層 SubAgent 轉型為領域主管（僅負責切割領域與審查報告），下層 SubAgent 在各自獨立的 Git 分支 (由 `WorkspaceManager` 隔離) 中進行實體修改，最終透過非同步審查進行 Merge。這徹底解決了 `MainAgent` 作為單一中樞的 Context 爆炸問題。

### B. 分身併發模式 (被動擴展 - Auto-Concurrency / Clone Mode)
*   **適用場景**：系統被動遭遇突發且大量的「同性質事件」（例如：Discord 機器人同時收到 100 人的詢問，或監控系統同時湧入 500 筆 Error Log）。
*   **運作機制**：這是底層 `EventBus` 與 `InboxBuffer` 提供的自適應流量防禦機制。當偵測到特定 Agent 的負載過高時，系統不會讓所有訊息在單一 Agent 的信箱排隊並污染上下文，而是**自動派生出多個與原 Agent 擁有完全相同「大腦」(Prompt 與 Tools) 的「分身 (Clones)」**。這些分身併發消化 DataBlock，處理完畢後分身隨即消散 (GC)。完美實現了類似 Serverless 的水平無縫擴容。

---

## 7. 跨會話事件訂閱與動態喚醒 (Cross-Session Event Subscription & Wakeup)

雖然在安全架構下「跨 Session 的資料絕對不流通」，但為了防範輪詢（Polling）造成的運算與 Token 浪費，EventBus 提供了跨會話的**系統事件訂閱與喚醒機制**：

*   **跨 Session 事件發佈**：當某個工作區或服務（如 Bob 的 Express API）成功啟動並通過健康檢查時，會向 EventBus 廣播一個公開的系統事件（例如：`SERVICE_STATUS_CHANGED`，攜帶 `{ serviceName: "bob-api", status: "UP" }`），此類事件不涉及私密資料。
*   **訂閱與掛起等待**：Alice 的 `SubAgent` 在整合測試連線失敗時，可在 `[ACT]` 階段向 EventBus 註冊對該服務 `UP` 事件的訂閱，並主動進入**持久化休眠**（Dehydrate）。
*   **動態事件喚醒（Wakeup）**：當 Bob 的服務上線事件觸發時，EventBus 檢查訂閱表，向 Control Plane 傳送喚醒信號。Control Plane 透過 ID 召回（Rehydrate）Alice 的 `SubAgent` 並投遞喚醒 DataBlock，推動其重試整合測試。這實現了零資源消耗的主動非同步通知。

---