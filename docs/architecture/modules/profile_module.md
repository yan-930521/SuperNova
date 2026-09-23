---
title: 人設與認知協議器官 (Profile Module)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 人設與認知協議器官 (Profile Module)

人設模組 (`src/core/agent/modules/ProfileModule.ts`) 是代理人的首要認知器官（優先級 `priority: 5`），負責定義代理人的自我身分識別、使命原則、通訊規範，並具備動態調整代理人語言模型規格的能力。

---

## 1. 核心職責與特性

1. **結構化人設定義**：支援載入規格化 JSON 人設檔案（例如角色姓名、語調偏好、性格特質與背景故事）。
2. **提示詞段落注入**：依據語意階層精確將內容映射至提示詞引擎：
   - `IDENTITY (1)`：注入身分識別與人設核心。
   - `MISSION (2)`：注入核心使命與不可侵犯之安全原則。
   - `CAPABILITIES (8)`：注入通訊協議、輸出格式與邊界規範。
   - `TOOLS (9)`：注入工具使用指引與限制。
3. **模型預設主動調度 (Preset Synchronization)**：當人設檔案中建議了特定 `llmPreset`（如 `"REASONING_FAST"`）時，模組在掛載 (`onAttach`) 或動態切換人設時，自動調用 `agent.setPresetName()` 提升底層模型推論維度。
4. **LRU 遞迴提示詞載入器 (PromptLoader)**：內建 TTL 快取機制，支援在提示詞文字中遞迴引入外部分割檔案 (`.md`)。

---

## 2. 結構與人設資料規範

```mermaid
flowchart TD
    JSON["人設設定檔\n(workspace/profiles/{version}/*.json)"] --> Loader["PromptLoader (LRU 快取)"]
    Loader --> Profile["AgentProfile 物件"]
    Profile --> PM["ProfileModule (priority: 5)"]

    PM -->|注入 IDENTITY (1)| PE["提示詞組裝引擎 (PromptEngine)"]
    PM -->|注入 MISSION (2)| PE
    PM -->|注入 CAPABILITIES (8)| PE
    PM -->|注入 TOOLS (9)| PE

    PM -->|建議 llmPreset| SetPreset["agent.setPresetName('REASONING_FAST')"]
```

### 2.1 人設 JSON 欄位定義 (`AgentProfile`)
```typescript
export interface AgentProfile {
    /** 代理人唯一識別名稱 */
    name: string;
    /** 角色身分定位說明 */
    identity: string;
    /** 核心使命與原則 */
    mission?: string;
    /** 核心能力特長說明 */
    capabilities?: string;
    /** 行為準則與限制 */
    guidelines?: string[];
    /** 輸出格式要求 */
    outputFormat?: string;
    /** 工具調用指引 */
    toolUsageGuide?: string;
    /** 推薦使用之模型預設 (如 "DEFAULT", "REASONING_FAST") */
    llmPreset?: string;
}
```

---

## 3. 執行期生命週期整合

### 3.1 容器掛載 (`onAttach`)
當 `UniversalAgent.attachModule(profileModule)` 執行時：
1. 模組保存 `IAgentContext` 句柄。
2. 若已加載之 Profile 包含 `llmPreset`，立即調用 `agent.setPresetName(profile.llmPreset)`，確保後續推理直接採用推薦模型。
3. 監聽相關人設更新事件。

### 3.2 提示詞段落生成 (`getPromptSections`)
模組將內部快取的結構化人設組裝為四組精確段落：
```typescript
public getPromptSections(): PromptSection[] {
    const sections: PromptSection[] = [];
    
    // 1. 身分認知
    sections.push({
        index: PromptSectionIndex.IDENTITY,
        content: this.profile.identity,
        priority: 5
    });

    // 2. 使命與原則
    if (this.profile.mission) {
        sections.push({
            index: PromptSectionIndex.MISSION,
            content: this.profile.mission,
            priority: 5
        });
    }

    // 8. 系統能力與協議
    sections.push({
        index: PromptSectionIndex.CAPABILITIES,
        content: this.buildCapabilitiesSection(),
        priority: 5
    });

    return sections;
}
```

---

## 4. 會話沙盒專屬落盤與實例隔離 (BaseJsonRepository)

為確保代理人具備獨立演化能力，且不污染全域唯讀的原型模板 (`workspace/profiles/`)，系統透過繼承 `BaseJsonRepository<AgentProfile>` 的 `FileSystemProfileRepository` 進行專屬沙盒持久化：

- **儲存庫基類**：繼承自 `@supernova/storage` 的 `BaseJsonRepository<AgentProfile>`，具備目錄自動建立、原子讀寫與例外攔截能力。
- **儲存路徑規範**：
  `{base_dir}/{session_dir}/{sessionId}/{agent_dir}/{agentId}/profile.json`
  （預設為 `./workspace/sessions/<sessionId>/agents/<agentId>/profile.json`）
- **落盤機制**：
  - 當模組掛載至 Agent (`onAttach`) 且偵測到具備所屬 `sessionId` 時，自動透過 `FileSystemProfileRepository.save()` 儲存至專屬目錄。
  - 提供公開方法 `saveProfile(targetPath?: string): Promise<string>` 與 `getProfileRepository()`，支援動態人設調整時即時落盤。


