# SuperNova 企業級開發實作路徑 (Enterprise Implementation Roadmap)

## 0. 核心設計原則 (Core Architectural Principles)
本計畫嚴格遵循 `docs/` 資料夾中的設計規範，核心目標是打造一個具備「工程紀律」的認知操作系統：
- **PDCA 專業分工**：Supervisor (路由), Planning (規劃), Doing (行動), Checking (審核), Acting (改善)。
- **三層記憶架構**：L1 (黑板/Key-Only), L2 (事實/JSONL), L3 (SOP/程序化)。
- **3x3 自癒階梯**：節點重試 -> 認知重規劃 -> 人工掛起。
- **Context 投影**：最小必要原則 (Need-to-know basis)，節省 Token 並提升精度。

---

## 1. 核心開發路徑 (The Implementation Path)

### 階段 1：基礎基礎設施與語義標準化 (Foundation & Semantics)
*目標：建立穩定且可追蹤的通訊基座。*
- **任務 1.1 標準化 Agent 消息與 TraceID**：
    - 實作 `IAgentMessage` 包裝事件負載，確保跨 Agent 請求具備統一的追蹤標記。
- **任務 1.2 實作 ContextService 與模板引擎**：
    - 根據 `docs/context/prompt_template.md` 實作自動化 Prompt 合成。
    - **重點任務**：實作 L1 黑板的 **Key-Only 注入邏輯**，Agent 僅能在 Prompt 中看到變數名，具體內容需呼叫工具讀取。
- **任務 1.3 脈搏引擎 (PulseEngine) 任務監控**：
    - 實作超時偵測，為每個階段任務設定「生命預期」。

### 階段 2：PDCA 認知閉環實裝 (The Reasoning Loop)
*目標：讓各角色具備實際的 LLM 推理能力。*
- **任務 2.1 DoingAgent 的 ReAct 循環**：
    - 讓 DoingAgent 具備「思考 -> 行動 -> 觀察」的自我修正能力。
    - **核心開發**：實作「語義對齊」邏輯，讓 Agent 能自動將 SOP 程序描述與黑板 Key 對接。
- **任務 2.2 PlanningAgent 的任務拆解**：
    - 實作 LLM 輸出符合 `TaskGraph` 結構的任務樹（Phase + Task）。
- **任務 2.3 CheckingAgent 的質量門禁**：
    - 實作驗證邏輯，能自動根據 Planning 的驗證標準產出 `Checking.Pass/Fail` 事件。

### 階段 3：記憶流動與自動摘要 (Memory Matrix Flow)
*目標：實現數據在 L1, L2, L3 之間的自動轉換與沈澱。*
- **任務 3.1 L1 -> L2 記憶壓縮器**：
    - 會話結束後，由 ActingAgent 觸發摘要邏輯，將驗證事實存入 L2 JSONL。
- **任務 3.2 L3 SOP 寫入邏輯**：
    - 將成功的、可複用的操作路徑轉化為「無變數」的程序化 SOP。
- **任務 3.3 按需檢索 (On-demand Fetch)**：
    - 完善 `read_blackboard`、`fetch_sop` 等工具，優化檢索精度。

### 階段 4：全自動自癒機制實裝 (Resilience Engine)
*目標：實現 3x3 自癒理論的後兩階。*
- **任務 4.1 Level 2：認知重規劃 (Cognitive Re-plan)**：
    - 當 Task 標記為 Failed，Supervisor 自動重新呼叫 PlanningAgent 讀取 `error_log` 進行局部重規劃。
- **任務 4.2 狀態機保護與回退**：
    - 實作「關鍵快照 (Snapshot)」，當重規劃失敗時能快速恢復到穩定的舊狀態。

### 階段 5：企業級觀測與介面 (Observability & UI)
*目標：透明化、可視化、可干預。*
- **任務 5.1 實時日誌與 WebSocket 網關**：
    - 推送 `recorder` 產生的結構化日誌至前端。
- **任務 5.2 SuperNova Deck (Web 面板)**：
    - 實作 TaskGraph 的節點狀態視覺化、L1 黑板內容即時瀏覽。
- **任務 5.3 授權檢查點 (Human-in-the-loop)**：
    - 在敏感工具呼叫前，系統發布 `AUTH_REQUIRED` 事件並暫停執行。

---

## 2. 具體待辦小任務 (Granular Tasks)

### 🛠️ 基礎建設 (Infrastructure)
- [ ] 定義 `EventType` 全量枚舉 (對齊 docs/agent/collaboration.md)。
- [ ] 在 `GlobalRuntime` 中註冊 `ContextService`。
- [ ] 為 `InferenceEngine` 加入 Token 消耗計數器。

### 🧠 Agent 核心 (Agent Core)
- [ ] 撰寫 DoingAgent 的核心 System Prompt (具備 SOP 對齊能力)。
- [ ] 撰寫 PlanningAgent 的 Phase/Task 拆解 Prompt。
- [ ] 實作 `ActingAgent` 的 SOP 標準化總結算法。

### 💾 數據層 (Data Layer)
- [ ] 實作 L1 Blackboard 的 `subscribeKey` 功能（當特定變數改變時觸發 Agent）。
- [ ] 完善 `FileSystemMemoryRepository` 的搜索過濾功能。

---

## 3. 想法發散與實驗室 (Ideas & Experiments)
- **Atomic Code Editor**：基於行號或 Hashes 的精準代碼修改工具。
- **Debate-Verify**：雙重 CheckingAgent 審核機制。
- **Pulse-Watchdog**：自動終止陷入 Token 迴圈或幻覺循環的 Agent 執行緒。
- **Local-Memory-Index**：在本地維護一個向量索引，加速 L3 SOP 的關鍵字命中。

---

## 4. 當前首要行動 (Immediate Action Items)
1. **Task-001**：實作 `IAgentMessage` 與 `traceId` 追蹤機制。
2. **Task-002**：實作 `ContextService` 並將 L1 改為 **Key-Only 注入**。
3. **Task-003**：完成 `DoingAgent` 的第一個完整 ReAct 推理循環測試。
