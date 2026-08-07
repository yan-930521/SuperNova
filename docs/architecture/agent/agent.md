---
title: Agent 系統設計
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes: 
  - ../../../src/core/agent/BaseAgent.ts
  - ../../../src/core/agent/MainAgent.ts
  - ../../../src/core/agent/TaskAgent.ts
  - ../../../src/core/agent/EmbodiedAgent.ts
  - ../../../src/core/agent/AgentManager.ts
  - ../../../src/core/agent/ProjectionHandler.ts
  - ../../../src/core/agent/LLMProvider.ts
  - ../../../src/core/agent/prompts.ts
related_docs:
  - ../../ARCH.md
---

# Agent 系統設計 (Agent System Design)

本系統將 Agent 的生命週期與存在型態進行嚴格區分，賦予其具備「具身智能 (Embodied AI)」的擴展能力，實現純邏輯運算與實體/虛擬環境互動的解耦。同時，系統的底層基石建立在純粹化、去業務邏輯的 `BaseAgent` 之上。

## 1. 基礎代理類別 (BaseAgent) 的基礎設施層

所有系統中的 Agent (`MainAgent`, `TaskAgent`, `EmbodiedAgent`) 皆繼承自 `BaseAgent`。`BaseAgent` 的職責被嚴格限縮於**「提供穩定的底層基礎設施與資源隔離」**，完全剝離具體的業務邏輯 (如 PDCA 循環或與 LLM 的網路通訊)。
*   **型態與擴展性聲明**：實體強制聲明其 `type: AgentType` (如 MAIN, TASK, EMBODIED 等)，以便系統進行正確的生命週期管理與路由。

*   **純粹的生命週期管理**：專注於系統資源與執行狀態管理。定義 `AgentState` 枚舉 (`INITIALIZING`, `IDLE`, `BUSY`, `SUSPENDED`, `TERMINATED`, `PROJECTING`)。系統設計有嚴謹的狀態遷移，例如 `setReady()` 方法由 `AgentManager` 明確標記初始化完成並切換至 `IDLE`。提供 `suspend()`, `resume()`, `destroy()` 狀態控制與資源清理介面。
*   **純粹的狀態匯出與匯入 (解耦)**：`BaseAgent` **不注入**任何 Repository。它只提供 `serialize(): BaseAgentData` 與 `hydrate(data)` 介面，將自身的狀態（包含 Token 消耗、狀態機、**結構化身份設定 Profile**、允許工具清單 `allowedTools`）打包，真正的持久化由外部的 `AgentManager` 負責調度。
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

*   **實例與依賴**：注入 `IAgentStateRepository` 與 `IEventBus`。內部維護 `activeAgents: Map<string, BaseAgent>` 作為活躍池，並實例化內部的 `ToolRegistry` 提供工具註冊與索取。
*   **靜態實例化 (Static Instantiation)**：不再依賴手動註冊工廠，而是直接於頂層引入 `MainAgent`, `TaskAgent`, `EmbodiedAgent`，根據 `AgentType` 透過 `switch` 判斷並直接 `new` 初始化。架構單純且具備強型別檢查優勢。
*   **動態工具分配 (Dynamic Tool Delegation)**：`spawnAgent` 與 `rehydrate` 時支援傳入或載入 `allowedTools: string[]`。Agent 會依據此清單向內部的 `ToolRegistry` 索取對應的無狀態工具單例。
*   **控制權反轉 (Tool Control)**：特定工具 (如 `SpawnAgentTool`, `TerminateSelfTool`) 可直接由 `ToolRegistry` 注入 `AgentManager` 控制權，不再侷限於 EventBus 事件驅動。
*   **脫水與喚醒 (Dehydrate & Rehydrate)**：
    *   `dehydrate(agentId)`：從活躍池取出 Agent，呼叫 `serialize()` 取得狀態快照（包含 `allowedTools`）並交由 Repository 存檔，隨後銷毀實體並釋放記憶體。
    *   `rehydrate(agentId)`：從 Repository 載入狀態，經由 Factory 實例化，並呼叫 `hydrate(data)` 恢復狀態，透過 `ToolRegistry` 重建工具綁定，最後加回活躍池。

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

為了讓 `EmbodiedAgent` 的「靈魂 (LLM 邏輯)」與「肉體 (環境接口)」解耦，系統採用依賴注入模式。在目前的實作中，`Body` 的注入機制已簡化為透過 `BaseTool[]` 與單一的字串 `envState` 進行管理，而非嚴格拆分的 `EnvPrompt`/`ActionTools`/`PhysicalState` 結構。

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

## 4. 實作細節與未文件化特性 (Implementation Details)

*   **`AgentState.PROJECTING` 狀態**：在 `AgentState` 枚舉中實作了 `PROJECTING` 狀態，用以標記正在進行意識投影（靈魂不在體內，不處理自身 Inbox）的代理人。
*   **動態隊友網路狀態注入 (Network State Injection)**：`AgentManager` 會攔截 `BeforeAgentStep` hook 並收集同一 Session 內的其它 Agent ID 資訊。這些資訊會被動態注入至 `ENVIRONMENT_STATE` 中，讓 LLM 能夠明確感知當前連線中的隊友，確保其知曉可以與誰進行通訊。
*   **時間感知插針機制 (Temporal Injection)**：`BaseAgent` 具備自動感知對話時間間隔的能力。當偵測到對話歷史紀錄中存在較大的時間落差時，系統會自動插入類似 `[系統提示：距離上一次對話已過 X 小時]` 的系統訊息 (`SystemMessage`)，賦予 Agent 對時間流逝的真實感知。
*   **`LLMProvider` 快取層**：目前的 `LLMProvider.ts` 內部實作了針對 LangChain Model 的快取管理，作為邁向完整 `ILLMProvider` 抽象化目標的初期實作。

---

> 進階功能規劃（PDCA 交互流程、高階擴展模型、跨會話事件訂閱）請參閱 [Agent 進階功能規劃](../../todo/agent_advanced.md)。