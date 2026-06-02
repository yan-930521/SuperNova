# 結構化 Prompt 模板 (Unified Prompt Template)

為了確保五大角色 Agent 在不同任務階段都能獲得一致且精準的指令背景，系統採用統一的模板結構進行 Context 注入。

## 模板骨架 (Skeleton)

```markdown
# {{AGENT_ROLE}} 任務指令

## 1. 核心身份 (Identity)
- 角色角色: {{identity_description}}
- 職責範圍: {{responsibility_boundary}}

## 2. 任務上下文 (Context - 從 Memory L1/L2/L3 投影)
- 原始目標: {{global_objective}}
- 當前里程碑: {{current_milestone}}
- **歷史經驗/SOP (L3)**: {{insights_from_acting_agent}}
- **已知事實 (L2)**: {{verified_facts}}

## 3. 執行環境 (Environment)
- 可用工具: {{available_tools}}
- 限制條件: {{constraints}}

## 4. 具體任務與輸入 (Input - 來自 Blackboard)
- 指令細節: {{task_instruction}}
- 依賴結果: {{dependency_data}}

## 5. 輸出規範 (Output Schema)
- 格式要求: {{format_requirements}}
```

## 注入邏輯
- **結構性注入**: 由 `SupervisorAgent` 或 `ContextService` 根據當前 Agent 角色，從 Memory 層級中提取對應片段填入。
- **動態更新**: 每次事件觸發（如 `Doing.Start`），模板會重新生成以包含最新的 Blackboard 狀態。
