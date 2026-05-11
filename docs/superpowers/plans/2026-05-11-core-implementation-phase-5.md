# SuperNova 核心實作計劃 (Phase 5: Global Orchestration)

> **對於 Agentic Workers：** 建議使用 `superpowers:subagent-driven-development` 技能來逐項執行此計劃。

**目標：** 實作全局運行時與會話管理器，將所有組件串聯為一個可運行的整體系統。

**架構：** 遵循 Tier 2 設計，實作具備全局 Tick 驅動與會話隔離能力的 Orchestration 層。

**技術棧：** TypeScript, Node.js。

---

### 任務 1：實作會話管理器 (SessionManager)

**文件：**
- 創建：`src/infra/SessionManager.ts`
- 測試：`tests/infra/SessionManager.test.ts`

- [ ] **步驟 1：撰寫測試案例**
測試會話的創建、查找、以及從 JSON Schema 啟動會話。

- [ ] **步驟 2：實作 SessionManager 類**
實作 `ISessionManager` 接口，負責維護 `ISession` 實例地圖。

- [ ] **步驟 3：提交變更**
```bash
git add src/infra/SessionManager.ts tests/infra/SessionManager.test.ts
git commit -m "feat: implement SessionManager for session lifecycle management"
```

---

### 任務 2：實作全局運行時 (GlobalRuntime)

**文件：**
- 創建：`src/runtime/GlobalRuntime.ts`
- 測試：`tests/runtime/GlobalRuntime.test.ts`

- [ ] **步驟 1：撰寫 Tick 驅動測試**
驗證多個 Session 是否能在全局 Tick 中被正確觸發。

- [ ] **步驟 2：實作 GlobalRuntime 類**
實作 `IRuntime` 接口，包含定時器觸發 `Session.tick()`。

- [ ] **步驟 3：提交變更**
```bash
git add src/runtime/GlobalRuntime.ts tests/runtime/GlobalRuntime.test.ts
git commit -m "feat: implement GlobalRuntime with tick orchestration"
```

---

### 任務 3：實作全鏈路集成測試 (End-to-End Flow)

**文件：**
- 創建：`tests/integration/EndToEnd.test.ts`

- [ ] **步驟 1：撰寫場景測試**
模擬一個包含目標解析、多 Agent 協作、以及並行工具執行的完整流程。

- [ ] **步驟 2：執行與調試**
確保所有組件（EventBus, Guardian, Scheduler, Registry）協同工作。

- [ ] **步驟 3：提交變更**
```bash
git add tests/integration/EndToEnd.test.ts
git commit -m "test: implement end-to-end integration test scenario"
```
