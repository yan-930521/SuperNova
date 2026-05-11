# SuperNova 核心實作計劃 (Phase 3: Tool System & Capability)

> **對於 Agentic Workers：** 建議使用 `superpowers:subagent-driven-development` 技能來逐項執行此計劃。

**目標：** 實作工具系統與能力驗證機制，使 Agent 能安全且受控地與外部世界交互。

**架構：** 遵循 Tier 2 設計，實作具備安全評級與預檢功能的工具系統，並整合權限驗證邏輯。

**技術棧：** TypeScript。

---

### 任務 1：實作工具註冊中心 (ToolRegistry)

**文件：**
- 創建：`src/infra/ToolRegistry.ts`
- 測試：`tests/infra/ToolRegistry.test.ts`

- [ ] **步驟 1：撰寫測試案例**
測試工具的註冊、按名稱查找以及列出所有工具的功能。

- [ ] **步驟 2：實作 ToolRegistry 類**
實作 `IToolRegistry` 接口。

- [ ] **步驟 3：提交變更**
```bash
git add src/infra/ToolRegistry.ts tests/infra/ToolRegistry.test.ts
git commit -m "feat: implement ToolRegistry for centralized tool management"
```

---

### 任務 2：實作基礎工具類 (BaseTool)

**文件：**
- 創建：`src/tool/BaseTool.ts`
- 測試：`tests/tool/BaseTool.test.ts`

- [ ] **步驟 1：撰寫測試案例**
測試輸入預檢 (`validateInput`) 與執行流程。

- [ ] **步驟 2：實作 BaseTool 抽象類**
實作 `ITool` 接口，提供默認的 `validateInput` 實作（如基於簡單 Schema 的檢查）。

- [ ] **步驟 3：提交變更**
```bash
git add src/tool/BaseTool.ts tests/tool/BaseTool.test.ts
git commit -m "feat: implement BaseTool with safety tiering and validation"
```

---

### 任務 3：實作能力驗證機制 (Capability Validator)

**文件：**
- 創建：`src/infra/CapabilityValidator.ts`
- 測試：`tests/infra/CapabilityValidator.test.ts`

- [ ] **步驟 1：撰寫權限檢查測試**
驗證當 Agent 缺少 `required_capabilities` 時，是否正確攔截。

- [ ] **步驟 2：實作 CapabilityValidator 類或靜態工具**
提供 `check(agent: IAgent, tool: ITool): boolean` 的邏輯。

- [ ] **步驟 3：提交變更**
```bash
git add src/infra/CapabilityValidator.ts tests/infra/CapabilityValidator.test.ts
git commit -m "feat: implement CapabilityValidator for permission control"
```
