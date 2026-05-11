SYSTEM ARCHITECTURE
│
├── GlobalRuntime
│   → 全局調度核心，負責 tick、資源分配與系統級執行節奏
│
├── AgentRegistry
│   → 全域唯一 Agent 資料源（Agent 為永久執行載體）
│
├── SessionManager
│   → 管理所有 Session（任務執行上下文與權限邊界）
│
├── SystemScopeManager
│   → 為 Session 建立 Agent 可見性與操作權限視圖
│
├── EventBus
│   → 事件驅動核心（Event 全資料化流動與分發）
│
├── EventStore
│   → 持久化事件紀錄（可查詢歷史行為流）
│
└── ToolRuntime
    → 世界交互層（所有實際行為最終執行入口）

---

SESSION LAYER (EXECUTION CONTEXT)
│
├── Session
│   → 單一任務運行單位（Goal + Context + Constraints）
│
│   ├── Goal
│   │   → 任務初始輸入（玩家 / 系統）
│   │
│   ├── ContextView (Memory Tiering & Compression)
│   │   → 混合記憶體機制：Active Context (最近摘要指針) + Checkpoint Archive (關鍵任務節點強制歸檔)
│   │
│   ├── TaskGraph (DAG)
│   │   → 任務拆解結構（Planner 產生）
│   │
│   ├── ActiveAgentView
│   │   → Session 可操作 Agent 子集（來自 Registry）
│   │
│   ├── HookRegistry
│   │   → 純資料化 Hook 集合（可運行 / 可修改）
│   │
│   ├── MutationPolicy
│   │   → 控制 Agent 是否可修改 Hook / Event 行為
│   │
│   ├── OpLog (Periodic Compression)
│   │   → 週期性壓縮 Operation Log 為結構化摘要，確保上下文效率
│   │
│   ├── ReadyQueue
│   │   → 用於並行調度
│   │
│   ├── MutationBuffer
│   │   → 用於暫存修改請求
│   │
│   ├── SnapshotManager (Strict Rollback Recovery)
│   │   → 基於快照的強一致性恢復策略；當發生不可修復錯誤時，自動 Rollback 到最近一個 Task 完成點
│   │
│   └── SessionRuntime
│       → Session tick 執行核心循環

---

MIDDLEWARE PIPELINE (中間件流水線)
│
├── ExecutionChain
│   → 所有核心行為（Tool 調用、Mutation 提交）必須經過一個由 Vertical System 或插件註冊的處理鏈
│
├── Interceptors (攔截點)
│   ├── Pre-Execution
│   │   → 負責 Input 預檢、安全評估及初始日誌記錄
│   │
│   ├── Post-Execution
│   │   → 負責結果轉換、Data-Only Output 表現分離處理
│   │
│   └── Error-Handling
│       → 負責異常捕獲、重試邏輯及觸發 Rollback 策略
│
└── Registration
    → 允許動態掛載領域特定的中間件邏輯

---

VERTICAL SYSTEM (DOMAIN LOGIC)
│
├── VerticalSystem
│   → 定義該領域如何解讀 Session（RTS / RPG / Sim）
│
│   ├── Planner
│   │   → Goal → TaskGraph（DAG生成）
│   │
│   ├── Coordinator
│   │   → Task → Agent 分配邏輯
│   │
│   ├── ScopeRules
│   │   → 定義 Session 可見 Agent 範圍
│   │
│   ├── HookCompiler
│   │   → 將 Hook data 轉為可執行 runtime 規則
│   │
│   └── DomainPolicy
│       → 行為限制與領域規則（RTS戰鬥 / 生產等）

---

AGENT LAYER (EXECUTION CORE)
│
├── BaseAgent
│   → 所有 Agent 的核心執行單位（policy + state + capability）
│
├── RootAgent
│   → 可創建/管理 Session 的高層決策 Agent
│
├── CoordinatorAgent
│   → 負責 TaskGraph 拆解與分配
│
├── ManagerAgent
│   → 管理 Worker 群組執行狀態
│
└── WorkerAgent (Specialized Identities)
    → 最底層執行單位（執行 Task → Intent → Tool）
    │
    └── Specialized Identity (專職化身份)
        → 不同角色的 Worker 為獨立的特化物件（如 CoderAgent, ResearcherAgent），具備特定的能力集與行為邏輯，由系統根據 Task 類型進行精確分配。

---

EXECUTION MODEL
│
├── Goal
│   → Session 起始輸入
│
├── TaskGraph (DAG)
│   → Planner 生成的任務結構
│
├── Task
│   → 最小可分配工作單位
│
├── Intent
│   → Agent 將 Task 轉換為行為描述
│
└── ExecutionResult
    → ToolRuntime 執行結果

---

SCHEDULING MODEL (DAG-BASED SCHEDULING)
│
├── TaskGraph Analysis
│   → 計算 TaskGraph 中每個 Task 的 In-degree (入度)
│
├── Ready Queue Entry
│   → 當 Task 的 In-degree 為 0 時，將其推入 Ready Queue (就緒隊列)
│
├── Dispatcher
│   → 調度器從 Ready Queue 中取出任務並分發給閒置的 WorkerAgent
│
└── Dependency Update
    → 任務完成後，更新 DAG 結構並重新計算其後續任務的 In-degree，循環觸發 Ready Queue Entry

---

EVENT & HOOK SYSTEM (FULL DATA-DRIVEN)
│
├── Event
│   → 完全資料化事件（type + payload + tags）
│
├── Hook
│   → 純資料規則（event match → action）
│
├── HookRegistry
│   → Session 內可動態修改的 Hook 集合
│
├── HookEngine
│   → 解釋 Hook 並觸發對應行為
│
├── MutationRequest
│   → Agent 提出的 Hook 修改請求
│
└── MutationValidator
    → 根據 Session MutationPolicy 決定是否允許修改

---

DATA MODEL
│
├── MutationRequest
│   {
│     "requester_id": string,    // 發起者 ID
│     "target_hook": string,      // 目標 Hook
│     "proposed_change": object,  // 提議變更
│     "priority": integer,        // 優先級
│     "version_ref": string       // 版本參考
│   }

---

CAPABILITY & TOOL SYSTEM
│
├── CapabilityRegistry
│   → 定義 Agent 能力類型
│
├── ToolRegistry
│   → 世界操作工具集合
│
├── ToolSet
│   → 分配給 Worker 的工具子集
│
└── Tool (Tool Dimensions)
    → 最底層執行單元（Move / Compute / Query / Act）
    │
    ├── Input Validation
    │   → 具備 Schema 驗證與邏輯預檢，確保調用參數合法性
    │
    ├── Safety Tiering (風險評級)
    │   → 分為 TIER_1 (Read-Only), TIER_2 (Side-Effect), TIER_3 (Destructive)
    │
    ├── Data-Only Output
    │   → 核心 Tool 只輸出純數據結構，由 Middleware 負責表現分離
    │
    └── Guardian Interface (穩定性守護接口)
        ├── Timeout Control
        │   → 工具執行必須具備超時限制，防止單一 Tool 阻塞整個系統 Tick
        └── Exception Isolation
            → 捕獲並隔離 Tool 執行期的錯誤，確保異常不影響系統主循環 (Main Tick)

---

COMMUNICATION MODEL
│
├── Message
│   → Agent 間標準化訊息格式
│   │
│   └── TraceContext (觀測性追蹤上下文)
│       ├── session_id
│       │   → 強制攜帶的會話標識，確保所有異步行為皆能歸因並記錄至 OpLog
│       └── span_id / parent_id
│           → 追蹤訊息因果鏈，實現完整的系統行為可觀測性
│
├── Inbox / Outbox
│   → Agent 消息緩衝區
│
├── Router
│   → 控制跨 Agent / Session 訊息流
│
└── SessionMessageFilter
    → 控制訊息是否允許進入 Session

---

RUNTIME LOOP
│
├── Global Tick
│   → 驅動所有 Session 與 System
│
├── Session Tick
│   → Session 內部獨立執行循環
│
├── Planning Phase
│   → 生成 TaskGraph
│
├── Dispatch Phase
│   → 分配 Task 給 Agent
│
├── Execution Phase (Middleware Integrated)
│   → 任務執行流：Intent → Pre-Execution Middleware → Tool Execution → Post-Execution Middleware
│
├── Event Processing Phase
│   → Event → Hook → Action
│
├── Mutation Phase
│   → 裁決流程：Mutation Request → MutationValidator → CoordinatorAgent → RootAgent
│
├── Recovery Phase (Strict Rollback)
│   → 若發生不可修復異常，觸發 SnapshotManager 回退到最近一個 Task 快照點
│
└── Aggregation Phase
    → 結果回寫 Session 狀態，並觸發 OpLog 週期性壓縮摘要