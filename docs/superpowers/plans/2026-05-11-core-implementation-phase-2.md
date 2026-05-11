# SuperNova 核心實作計劃 (Phase 2: Agent Infrastructure)

> **對於 Agentic Workers：** 建議使用 `superpowers:subagent-driven-development` 技能來逐項執行此計劃。

**目標：** 實作 Agent 基礎架構，包含基礎 Agent 類、動態註冊中心與核心協調邏輯。

**架構：** 遵循 Tier 2 設計，實作具備序列化能力的 BaseAgent 與支持 JSON 加載的 Registry。

**技術棧：** TypeScript。

---

### 任務 1：實作基礎 Agent (BaseAgent)

**文件：**
- 創建：`src/agent/BaseAgent.ts`
- 測試：`tests/agent/BaseAgent.test.ts`

- [ ] **步驟 1：撰寫測試案例**
測試 JSON 初始化、序列化與基礎訊息處理。

- [ ] **步驟 2：實作 BaseAgent 類**
實作 `IAgent` 接口，包含 `initFromJSON` 與 `toJSON`。

- [ ] **步驟 3：提交變更**
```bash
git add src/agent/BaseAgent.ts tests/agent/BaseAgent.test.ts
git commit -m "feat: implement BaseAgent with serialization support"
```

---

### 任務 2：實作 Agent 註冊中心 (AgentRegistry)

**文件：**
- 創建：`src/infra/AgentRegistry.ts`
- 測試：`tests/infra/AgentRegistry.test.ts`

- [ ] **步驟 1：撰寫測試案例**
測試 Agent 的註冊、查找與從 JSON 批量加載。

- [ ] **步驟 2：實作 AgentRegistry 類**
實作 `IAgentRegistry` 接口。

- [ ] **步驟 3：提交變更**
```bash
git add src/infra/AgentRegistry.ts tests/infra/AgentRegistry.test.ts
git commit -m "feat: implement AgentRegistry for dynamic agent management"
```

---

### 任務 3：實作核心協調者 (CoordinatorAgent)

**文件：**
- 創建：`src/agent/CoordinatorAgent.ts`
- 測試：`tests/agent/CoordinatorAgent.test.ts`

- [ ] **步驟 1：撰寫裁決與規劃測試**
驗證 `arbitrateMutations` 的優先級邏輯。

- [ ] **步驟 2：實作 CoordinatorAgent 類**
繼承 `BaseAgent` 並實作 `ICoordinator` 接口。

- [ ] **步驟 3：提交變更**
```bash
git add src/agent/CoordinatorAgent.ts tests/agent/CoordinatorAgent.test.ts
git commit -m "feat: implement CoordinatorAgent with mutation arbitration"
```
