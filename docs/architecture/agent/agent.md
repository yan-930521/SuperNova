---
title: Agent 系統設計
version: 0.1.1
status: APPROVED
last_updated: 2026-08-03
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

所有系統中的 Agent (`MainAgent`, `TaskAgent`, `EmbodiedAgent`) 皆繼承自 `BaseAgent`。`BaseAgent` 的職責被嚴格限縮於**「提供穩定的底層基礎設施與資源隔離」**，完全剝離具體的業務邏輯 (如 PDCA 循環或與 LLM 的網路通訊)。
*   **型態與擴展性聲明**：實體強制聲明其 `type: AgentType` (如 MAIN, TASK, EMBODIED 等)，以便系統進行正確的生命週期管理與路由。

*   **純粹的生命週期管理**：專注於系統資源與執行狀態管理。定義 `AgentState` 枚舉 (`INITIALIZING`, `IDLE`, `BUSY`, `SUSPENDED`, `TERMINATED`)。系統設計有嚴謹的狀態遷移，例如 `setReady()` 方法由 `AgentManager` 明確標記初始化完成並切換至 `IDLE`。提供 `suspend()`, `resume()`, `destroy()` 狀態控制與資源清理介面。
*   **純粹的狀態匯出與匯入 (解耦)**：`BaseAgent` **不注入**任何 Repository。它只提供 `serialize(): BaseAgentData` 與 `hydrate(data)` 介面，將自身的狀態（包含 Token 消耗、狀態機、**結構化身份設定 Profile**）打包，真正的持久化由外部的 `AgentManager` 負責調度。
*   **結構化大腦設定 (AgentProfile JSON)**：Agent 的核心提示詞不是一段死板的字串，而是一個嚴謹的 JSON 結構 (包含 `roleName`, `objectives`, `constraints`, `contextData` 等)。這讓 Agent 能在執行過程中透過程式化方式動態更新認知，且完美支援脫水序列化。
*   **資源消耗追蹤**：內部維護 `UsageStats` (Token 與執行時間等消耗)，提供 `recordUsage` 讓子類別回報並具備安全閾值告警機制。

## 2. Agent 意識與戰術分層架構 (Consciousness & Tactical Layering)

系統重構為「雙腦意識架構 (Dual-Brain Consciousness Architecture)」，嚴格切分高階情感感知與底層戰術執行。Agent 分為以下兩大層級：

### A. `MainAgent` (意識與感知層 / Consciousness Layer)
*   **定義**：系統的中樞靈魂與情感載體。
*   **重構重點**：嚴格限制其權責，**不直接參與任何工具調用 (Tool Calling) 或物理座標計算**。純粹處理高階認知、情緒演算與任務分派。
*   **核心功能**：
    *   **OCC 情緒與動機驅動 (Emotion & Motivation)**：維護基礎內部狀態（如能量 `energy`、親密度 `intimacy`），在背景自主產生微小的陪伴行為動機。
*   **特徵**：長期存在，具備「上帝視角 (God Mode)」進行路由與分發，但與底層邏輯與遊戲資料嚴格隔離。

### B. `TaskAgent Layer` (領域戰術核心層 / Tactical Core Layer)
*   **定義**：為了解決特定領域任務而喚醒的戰術大腦。
*   **重構重點**：**上下文徹底隔離 (Context Isolation)**，避免 IDE 程式碼與 Minecraft 遊戲資料互相污染。
*   **左腦：Task TaskAgent (邏輯與開發)**：
    *   專注於確定性、高邏輯的 IDE 互動。
    *   僅在使用者發起程式開發、除錯等相關請求時被喚醒。
    *   採用 **持久化休眠與 ID 召回 (Dehydrate & Rehydrate)** 機制以節省資源。
*   **右腦：Embodied TaskAgent (空間與行為)**：
    *   專注於 3D 空間概念、狀態機與 SOP 決策（如：採集、戰鬥、跟隨）。
    *   **不處理底層微操**：它不直接處理尋路微操或按鍵，而是向下發送高階的意圖指令（Intent Command）。
    *   **CLI 具象化整合**：底層的 Minecraft 物理操作已被具象化為 CLI 指令，右腦只需決策並直接呼叫對應的 CLI 工具（例如採集木頭、移動到定點）即可，達到「意識與肉體」的完美解耦。

---

## 2.5 AgentManager (代理人管理器)
為了落實領域驅動設計 (DDD)，將實體與儲存設施解耦，系統引入 `AgentManager` 負責統籌 Agent 的存活與狀態快照。

*   **實例與依賴**：注入 `IAgentStateRepository` 與 `IEventBus`。內部維護 `activeAgents: Map<string, BaseAgent>` 作為活躍池。
*   **靜態實例化 (Static Instantiation)**：不再依賴手動註冊工廠，而是直接於頂層引入 `MainAgent`, `TaskAgent`, `EmbodiedAgent`，根據 `AgentType` 透過 `switch` 判斷並直接 `new` 初始化。架構單純且具備強型別檢查優勢。
*   **脫水與喚醒 (Dehydrate & Rehydrate)**：
    *   `dehydrate(agentId)`：從活躍池取出 Agent，呼叫 `serialize()` 取得狀態快照並交由 Repository 存檔，隨後銷毀實體並釋放記憶體。
    *   `rehydrate(agentId)`：從 Repository 載入狀態，經由 Factory 實例化，並呼叫 `hydrate(data)` 恢復狀態，最後加回活躍池。

---

## 2.8 大腦邏輯與 LLM 串接 (Brain Integration)
為了快速驗證與推動功能開發，系統目前採用務實的串接策略：
*   **結構化認知轉譯**：Agent 在處理信件 (`processInbox`) 時，會在記憶體中將 `AgentProfile` JSON 動態渲染為結構化的 LLM 系統提示詞。
*   **角色認知嚴格劃分**：在組裝給 LLM 的訊息列隊時，嚴格對齊 LangChain 的生態。DataBlock 內部將精準區分角色為 `'human'` (使用者輸入) 或 `'ai'` (系統/代理人回覆)，並自動轉譯為 `HumanMessage` 與 `AIMessage`，徹底解決角色混淆與 LLM 嚴重幻覺問題。
*   **直接整合 LangChain 生態與 ReAct 迴圈透明化**：我們暫不實作抽象包裹層，而是直接在 Agent 內部整合 `@langchain/core` 等套件。將 `DataBlock` 歷史轉譯為 `BaseMessage` 陣列後直接呼叫模型。
    *   **透明化中間歷程**：針對 `createAgent` 預設將中間思考與工具呼叫過程當作黑箱的限制，`BaseAgent.callModel` 會在呼叫結束後，精準擷取這段期間新生成的 `BaseMessage[]`，並將其一一反序列化映射為強型別的 `DataBlock`（區分 `intent: AGENT_REPLY` 與 `intent: TOOL_CALL`），最後以批次陣列的形式透過 `AgentMessage` 全域廣播。這保證了每一次的工具調用、內部推論與失敗重試，都能 100% 寫入 Oplog 供系統時空旅行與除錯。
*   **工具無狀態化與職責剝離**：底層的 `BaseTool` 僅專注於執行邏輯並回傳原生資料，不再負責自行封裝或廣播 `DataBlock`，徹底消除 LLM 視野內的雜訊標頭，實現了「工具負責做事，大腦負責記憶與廣播」的優雅職責分離。
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

### 3.1 意識投影與 ContextOverride (Consciousness Projection)
為解決雙 Agent 架構下的指令傳達斷層與「大腦/小腦」的認知負擔，系統引入「意識投影 (Consciousness Projection)」機制，允許 `MainAgent` 透過動態覆寫來接管 `EmbodiedAgent` 的肉體。

*   **無狀態的執行者 (Stateless Executor)**：`BaseAgent` 的 `processInbox` 設計為純粹的狀態執行器，接受外部傳入的 `ContextOverride`，允許動態注入 `fullHistory` (記憶)、`tools` (能力) 與 `profile` (人設)，甚至 `envState` (環境感知)。代理人本身不再存放任何投影狀態變數，徹底剝離了複雜的業務邏輯。
*   **會話級的狀態管理 (Session-Level State)**：投影狀態 (Brain <-> Body 的連結) 由 `Session` 的 `metadata.projections` 統一管理。即便伺服器重開機 (Dehydrate -> Rehydrate)，投影狀態也能無縫接軌。
*   **中介調度器 (ProjectionHandler)**：當 `SessionManager` 發現某個大腦正在投影時，不會直接呼叫大腦，而是動態組裝出一個 `ProjectionHandler`。
    *   它作為 Proxy，負責將大腦的設定 (Prompt/Tools/歷史) 疊加到軀殼的感知 (EnvState/Tools) 上，整合成最終的 `ContextOverride`。
    *   在呼叫 `body.processInbox` 前，觸發大腦的 `BeforeAgentStep` Hook 進行擴充 (例如動態組裝隊友資訊)。
    *   執行完畢後，它將消耗的 Token 準確歸屬於大腦的帳單中。
*   **動態快取防污染**：底層使用 `generateToolsSignature` 與 `reactAgentCache`，確保在各種動態注入 Tool 的組合下，不會污染 Agent 實體的原生設定，同時保有極高的編譯快取效能。

---

## 4. 代理層 PDCA 交互流程 (Data Flow)
*(以 `TaskAgent` 處理任務為例)*

1. **Plan (規劃)**
2. **Do (執行)**
   * `TaskAgent` 調用 `dispatch_workers(wait_mode="ALL")`，隨後進入非同步掛起，停止消耗 Token。
3. **Check (檢視)**
   * `EventBus` 將結果封裝為 `DataBlock` 送入 `InboxBuffer`，並喚醒 `TaskAgent`。
   * 若存在異常結果，`ContextManager` 自動觸發 Hot-Lock 鎖定現場。
4. **Act (修正與收尾)**
   * `TaskAgent` 調閱 Oplog 與 Buffer 內容，進行冷靜決策。
   * 若需修正，呼叫 `patch_task_graph` 動態增刪改 DAG 節點，重新進入 Do 循環。
   * 若任務完全成功，將最終狀態 Deep Merge 回 `MainAgent`。
   * **清理與閒置 (Lazy GC)**：系統解除該任務的 `Workspace` 與 `Oplog` 綁定 (執行嚴格的記憶擦除)，將該 `TaskAgent` 切換至 `IDLE` 狀態並啟動 TTL 倒數計時。若超時則執行最終實體銷毀。

---

## 5. 指令集與 Prompt 規範 (Prompt as ISA)
將 `Prompt` 視為驅動無形體 `TaskAgent` 的指令集。Prompt 中必須明確約定 PDCA 各個狀態的行為準則與嚴格約束：
*   **【DO 規範】**：拓撲圖就緒後，僅能下達並發指令並進入掛起狀態。
*   **【CHECK 規範】**：喚醒後，強制要求比對 `DataBlock` 與 `Oplog` 中的預期目標。嚴禁在此階段臆測外部狀態。
*   **【ACT 規範】**：遭遇錯誤時，依賴被鎖定的完整上下文進行反思，並調用修補工具；連續失敗超出上限則必須通報。

---

## 6. 高階擴展與併發模型 (Advanced Scaling Models)

為了解決大數據處理與巨型專案維護的擴展性瓶頸，系統支援兩種不同維度的 Agent 擴展模型：

### A. 樹狀派生模式 (主動派生 - Fractal Delegation)
*   **適用場景**：處理極度複雜、需要大量思考與拆解的單一巨型任務（例如：維護擁有 500 個模組的專案）。

### B. 無狀態併發模式 (被動擴展 - Stateless Auto-Concurrency)
*   **適用場景**：系統被動遭遇突發且大量的「同性質事件」（例如：Discord 機器人同時收到 100 人的詢問，或監控系統同時湧入 500 筆 Error Log）。
*   **運作機制**：這是依賴 `BaseAgent` 的無狀態化特性 (`Stateless Executor`) 所達成的完美水平擴展。當 `SessionManager` 從 Inbox 中抽取到多筆平行事件時，**不需要實體上複製或 Clone Agent**，而是直接將事件打包為多個 `messageBatches`，並在同一個 Agent 內部發起多次非同步的 `processInbox` 呼叫。由於每個呼叫都會動態抓取獨立的歷史記憶與上下文 (`ContextOverride`)，且不修改實體狀態，因此單一 Agent 即可瞬間處理無上限的併發請求。這完美實現了類似 Serverless 的極致效能與零擴容成本。

---

## 7. 跨會話事件訂閱與動態喚醒 (Cross-Session Event Subscription & Wakeup)

雖然在安全架構下「跨 Session 的資料絕對不流通」，但為了防範輪詢（Polling）造成的運算與 Token 浪費，EventBus 提供了跨會話的**系統事件訂閱與喚醒機制**：

*   **跨 Session 事件發佈**：當某個工作區或服務（如 Bob 的 Express API）成功啟動並通過健康檢查時，會向 EventBus 廣播一個公開的系統事件（例如：`SERVICE_STATUS_CHANGED`，攜帶 `{ serviceName: "bob-api", status: "UP" }`），此類事件不涉及私密資料。
*   **訂閱與掛起等待**：Alice 的 `TaskAgent` 在整合測試連線失敗時，可在 `[ACT]` 階段向 EventBus 註冊對該服務 `UP` 事件的訂閱，並主動進入**持久化休眠**（Dehydrate）。
*   **動態事件喚醒（Wakeup）**：當 Bob 的服務上線事件觸發時，EventBus 檢查訂閱表，向 Control Plane 傳送喚醒信號。Control Plane 透過 ID 召回（Rehydrate）Alice 的 `TaskAgent` 並投遞喚醒 DataBlock，推動其重試整合測試。這實現了零資源消耗的主動非同步通知。

---