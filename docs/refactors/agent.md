# Agent 角色全面升級 (Agent Roles 0.4.0 Upgrade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升級五大角色實作，使其支持智慧路由、動態換檔、分形拆解與共享黑板協作。

**Architecture:** 
1. **Supervisor (SA)**: 擔任智慧路由器與異常調度員。
2. **Planning (PA)**: 實作分形子圖生成與 L3 SOP 整合。
3. **Doing (DA)**: 強化共享黑板寫入與異常上報 (Scope Creep)。
4. **Checking (CA)**: 實作基於 PDCA 門禁標準的品質審核。
5. **Acting (AA)**: 實作事實升遷 (L2S -> L2G) 與 SOP 標準化。

**Tech Stack:** TypeScript, LangChain, Zod

---

### Task 0: BaseAgent 基礎重構 (支援新地基)

**Files:**
- Modify: `src/agent/BaseAgent.ts`

- [x] **Step 1: 實作輔助開發方法**
在 `BaseAgent` 中封裝 `postToL1` 方法，子類可直接呼叫 `this.postToL1(key, data)`。

- [x] **Step 2: 內置心跳同步邏輯**
整合 `PulseEngine` 調用，確保 Agent 在活躍期間自動更新其所屬 Task 的心跳。

- [x] **Step 3: 優化日誌 Trace 傳遞**
確保所有透過 `this.log` 產出的紀錄都自動攜帶當前事件的 `spanId` 與 `traceId`。

---

### Task 1: SupervisorAgent (指揮官) 升級

**Files:**
- Modify: `src/agent/roles/SupervisorAgent.ts`
- Create: `src/tool/core/DispatchTaskTool.ts`
- Modify: `prompts/identity/mainAgent.md`

- [ ] **Step 1: 實作 DispatchTask 工具**
建立新工具，Schema 須包含 `templateType` (Enum: Instant, Standard, etc.) 與 `description`。移除舊有的 `GoalDispatcherTool` 對 `src_bk` 的依賴。

- [ ] **Step 2: 實作 SA 智慧路由邏輯**
SA 在接收目標時，能透過語義判定選定最優模板。

- [ ] **Step 3: 實作換檔 (Escalation) 監聽**
監聽 `AgentEvents.Flow.Escalate`，並根據回報內容決定是否更換任務模板或發起 `Emergency` 修復任務。

---

### Task 2: PlanningAgent (規劃師) 分形重構

**Files:**
- Modify: `src/agent/roles/PlanningAgent.ts`
- Modify: `prompts/identity/analyst.md`

- [ ] **Step 1: 實作分形任務拆解邏輯**
PA 產出的不再是扁平列表，而是封裝於母任務 `subGraph` 中的 `TaskGraph` 數據。

- [ ] **Step 2: 整合 SOP (L3) 檢索**
在規劃前，PA 先呼叫 `fetch_sop_index` 工具，根據目標關鍵字獲取適用 SOP，並將其步驟植入 `subGraph`。

---

### Task 3: DoingAgent (行動者) 共享與回報強化

**Files:**
- Modify: `src/agent/roles/DoingAgent.ts`
- Modify: `prompts/identity/coder.md`

- [ ] **Step 1: 實作 L1 共享黑板主動寫入**
DA 在執行中需呼叫 `MemoryService.postToL1` 實時同步中間結果（如：發現的配置值、程式碼片段），供 CA 後續審核。

- [ ] **Step 2: 範圍溢出 (Scope Creep) 偵測**
若 DA 判定當前任務需要改動超過 3 個檔案或觸及架構，需主動停止執行並發送 `Escalate` 回報 SA。

---

### Task 4: CheckingAgent (審核者) 與 ActingAgent (改善者) 閉環補全

**Files:**
- Modify: `src/agent/roles/CheckingAgent.ts`
- Modify: `src/agent/roles/ActingAgent.ts`

- [ ] **Step 1: CA 基於 L1 數據的檢核**
CA 應從 L1 讀取 DA 的產出與 DA 的思考軌跡進行質量比對，決定 `Transition` 結果 (success/fail)。

- [ ] **Step 2: AA 事實升遷邏輯**
當任務成功 (FINISH) 後，AA 判定事實價值。若是專案級事實，呼叫 `save_to_l2(scope='global')` 完成事實升遷。

---

### Task 5: 全流程 Demo 驗證

- [ ] **Step 1: 執行 Standard 流程測試**
從 SA 發起目標 -> PA 規劃 -> DA 執行 -> CA 審核 -> AA 結案。

- [ ] **Step 2: 執行 Emergency 換檔測試**
模擬 DA 超時或崩潰，驗證 SA 能否自動發起 reAct 修復。

---

### Task 6: 提交 Agent 升級代碼

- [ ] **Step 1: 類型檢查與 Commit**
```bash
git add . ; git commit -m "feat: upgrade all Agent roles to v0.4.0 (fractal tasks, smart routing, shared memory)"
```

---

### Task 7: 代碼清理與優化 (2026-06-09 追加)

- [x] **Step 1: 刪除專案中所有測試相關文件與目錄**
- [x] **Step 2: 重構 `BaseAgent.ts`，將 `warmupEngine` 提取為 `initEngine` 並直接在構造函數中初始化，精簡所有 Role Agent 代碼。**
