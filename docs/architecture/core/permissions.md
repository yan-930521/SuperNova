---
title: Agent 權限系統 (Permission System)
version: 0.1.0
status: APPROVED
last_updated: 2026-08-28
related_codes:
  - ../../../src/core/agent/BaseAgent.ts
  - ../../../src/core/tools/BaseTool.ts
related_docs:
  - ../../ARCH.md
  - ../agent/tool.md
---

# Agent 權限系統 (Permission System)

本文件描述 SuperNova 系統中，針對代理人 (Agent) 實施的高顆粒度權限管理架構。本系統採用字串陣列 (String Array) 設計，代理人會維護一個包含多個權限字串的陣列，實現了零信任 (Zero Trust) 與動態授權的機制。

## 1. 核心設計理念 (Design Philosophy)

*   **雙重防護機制**：
    1.  **可見性 (Visibility)**：透過 `allowedTools` 陣列決定 Agent 能「看見」什麼工具 (節省 Token 並減少幻覺)。
    2.  **執行權限 (Execution Clearance)**：透過本權限系統 (字串陣列) 決定 Agent 「實際能執行」什麼操作。即使工具被惡意呼叫，底層缺乏權限也會被強制攔截。
*   **系統級權限控制**：權限不僅限制工具 (如 Bash 執行)，也限制系統背景行為 (如換日記憶總結、圖譜記憶萃取等)。
*   **自然語言的授權升級 (Permission Escalation)**：當子 Agent 權限不足時，無需專門的請求工具，只需透過內建的 `SendMessageTool` 用自然語言向上層主管 (或人類) 提出需求，由主管評估後發放權限。

## 2. 權限常數 (Permission Strings)

系統定義了一系列權限常數字串，方便組合與驗證。範例結構如下：

```typescript
export const AgentPermissions = {
    // 基礎檔案與環境操作
    READ_WORKSPACE: 'READ_WORKSPACE',
    WRITE_WORKSPACE: 'WRITE_WORKSPACE',
    EXECUTE_COMMANDS: 'EXECUTE_COMMANDS',
    
    // 範圍限制 (危險操作)
    MODIFY_CORE_SYSTEM: 'MODIFY_CORE_SYSTEM', // 允許修改 src/core 等核心檔案
    
    // 系統與記憶功能
    MANAGE_GRAPH_MEMORY: 'MANAGE_GRAPH_MEMORY', // 允許觸發/維護圖譜記憶
    TRIGGER_DAILY_SUM: 'TRIGGER_DAILY_SUM', // 允許觸發換日與情境記憶總結
    
    // 代理人與任務管理
    SPAWN_TEMP_AGENT: 'SPAWN_TEMP_AGENT', // 允許產生暫時性子代理人
    SPAWN_PERSISTENT: 'SPAWN_PERSISTENT', // 允許產生持久性代理人
    ASSIGN_TASKS: 'ASSIGN_TASKS',
    
    // 特殊權限
    CONTROL_EMBODIMENT: 'CONTROL_EMBODIMENT', // 允許控制 3D/實體軀殼
    GRANT_PERMISSIONS: 'GRANT_PERMISSIONS', // 允許修改他人的權限
    
    // 系統最高權限
    ADMINISTRATOR: 'ADMINISTRATOR'
} as const;
```

## 3. 權限賦予與檢驗流程 (Workflow)

### 3.1 初始賦權 (Initial Assignment)
當 `AgentManager.spawnAgent()` 被呼叫時，必須顯式傳入 `initialPermissions` 陣列。
*   **MainAgent**：通常預設獲取 `['ADMINISTRATOR']`。
*   **一般 TaskAgent**：根據指派的任務，獲取最低限度的所需權限 (例如僅 `['READ_WORKSPACE', 'WRITE_WORKSPACE']`)。

### 3.2 執行時檢驗 (Runtime Validation)
*   **工具層攔截**：在 `BaseTool.execute` 中，檢查 `context.agentPermissions` 是否包含該工具宣告的 `requiredPermission`。
*   **系統層攔截**：在 `MemoryManager` 等背景服務運作時，檢查該 Agent 陣列中是否包含對應權限 (例如 `'MANAGE_GRAPH_MEMORY'`)，若無則不執行萃取。

### 3.3 動態向上請求 (Upward Request via SendMessage)
當子 Agent 執行工具收到 `Permission Denied` 錯誤時，工作流如下：
1. 子 Agent 意識到自己缺乏某項權限。
2. 子 Agent 使用 `SendMessageTool` 傳送訊息給其 Supervisor (如 `MainAgent`) 說明理由：「我需要 MODIFY_CORE_SYSTEM 權限才能修復 index.ts 的 Bug。」
3. Supervisor 收到訊息後進行邏輯判斷 (甚至詢問人類使用者)。
4. Supervisor 若同意，使用具備 `GRANT_PERMISSIONS` 權限專屬的 `GrantPermissionTool`，動態將字串推入該子 Agent 的權限陣列中。
5. 子 Agent 收到權限更新成功的系統通知後，重試任務。
