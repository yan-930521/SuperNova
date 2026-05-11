# SuperNova 接口體系實作計劃

> **對於 Agentic Workers：** 建議使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 技能來逐項執行此計劃。步驟使用複選框 (`- [ ]`) 語法進行追蹤。

**目標：** 根據已核准的設計規範，完整建立 SuperNova 的 TypeScript 接口體系，為後續實作打下強類型基礎。

**架構：** 採用 `./interfaces/mods/` 模組化結構，將接口 (Interface) 與數據模型 (Models) 進行邏輯隔離。

**技術棧：** TypeScript。

---

### 任務 1：建立基礎模型與 Session 接口

**文件：**
- 創建：`interfaces/mods/models.ts`
- 創建：`interfaces/mods/session.ts`

- [ ] **步驟 1：實作模型接口**
在 `interfaces/mods/models.ts` 中定義 `Event` 與 `IMutationRequest`，並包含詳細中文註解。

- [ ] **步驟 2：實作 Session 接口**
在 `interfaces/mods/session.ts` 中定義 `ISession`, `IOpLog`, `IReadyQueue` 以及對應的 JSON Schema。

- [ ] **步驟 3：提交變更**
```bash
git add interfaces/mods/models.ts interfaces/mods/session.ts
git commit -m "feat: implement core models and session interfaces"
```

---

### 任務 2：實作 Runtime、Guardian 與 Agent 體系

**文件：**
- 創建：`interfaces/mods/runtime.ts`
- 創建：`interfaces/mods/agent.ts`

- [ ] **步驟 1：實作運行時與守護接口**
在 `interfaces/mods/runtime.ts` 中定義 `IRuntime` 與 `IGuardian`。

- [ ] **步驟 2：實作 Agent 多層級接口**
在 `interfaces/mods/agent.ts` 中定義 `IAgent`, `ICoordinator`, `IRootAgent` 及其序列化接口。

- [ ] **步驟 3：提交變更**
```bash
git add interfaces/mods/runtime.ts interfaces/mods/agent.ts
git commit -m "feat: implement runtime and multi-level agent interfaces"
```

---

### 任務 3：實作基礎設施、領域邏輯與工具系統

**文件：**
- 創建：`interfaces/mods/infra.ts`
- 創建：`interfaces/mods/vertical.ts`
- 創建：`interfaces/mods/tool.ts`
- 創建：`interfaces/mods/comm.ts`
- 創建 : `interfaces/mods/hook.ts`

- [ ] **步驟 1：實作基礎設施與領域接口**
建立 `IAgentRegistry`, `ISessionManager`, `IVerticalSystem` 定義。

- [ ] **步驟 2：實作工具、通訊與裁決接口**
建立 `ITool`, `IRouter`, `IMutationValidator` 定義。

- [ ] **步驟 3：提交變更**
```bash
git add interfaces/mods/infra.ts interfaces/mods/vertical.ts interfaces/mods/tool.ts interfaces/mods/comm.ts interfaces/mods/hook.ts
git commit -m "feat: complete infrastructure, domain, and tool interfaces"
```
