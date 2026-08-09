---
title: CodeSkill 自進化與狀態管理系統
version: 0.1.0
status: DRAFT
last_updated: 2026-08-09
---

# CodeSkill 自進化與狀態管理系統 (Self-Evolving CodeSkill & State Management)

在 `EmbodiedAgent` 的發展藍圖中，為了避免受到 LLM 輸出不穩定或是 Context Window 限制，我們引入了「**CodeSkill**」架構。
Agent 在遇到未知的長期目標時，能夠透過撰寫、測試與保存 TypeScript 程式碼，將複雜的行為固化為可重複利用的技能 (Skill Library)，這正是達成「通用具身智能」的核心引擎。

---

## 1. 自身狀態管理與自描述機制 (Self-Documenting State Registry)
在連續且複雜的環境中 (如 Minecraft)，Agent 需要維護自身的短期與長期狀態。為了讓 LLM 能在未來精確地理解並修改這些狀態，狀態管理不能只是單純的 Key-Value，而必須是**具備語意描述 (Self-Documenting)** 的結構。

- **資料結構**: 每個狀態節點都包含 `value` 與 `description`。
  ```typescript
  interface StateEntry<T = any> {
      value: T;
      description: string; // 讓 LLM 明白這個數值的意義與單位
  }
  ```
- **增刪改查 (CRUD)**:
  - **註冊 (Register)**: `agent.state.register('hunger_level', 20, 'Current hunger level, max 20, min 0. If below 6, cannot sprint.')`
  - **讀取 (Get)**: `agent.state.get('hunger_level')`
  - **更新 (Update)**: `agent.state.update('hunger_level', 15)`
  - **刪除 (Delete)**: `agent.state.delete('last_enemy')`
- **持久化與隔離**: 這些帶有描述的狀態樹會與 Agent 的生命週期綁定，確保 Agent 重啟後，不僅記得數值，也記得該數值背後的「意義」。

---

## 2. CodeSkill 的繼承體系 (Class Hierarchy)
CodeSkill 並非隨意的字串函數，而是一套具有嚴格型別約束 (Strongly-typed) 的類別體系。所有的技能都必須繼承自基礎類別。

*   **`BaseSkill`**
    所有技能的根類別，注入了 `bot` (環境控制) 以及 `state` (狀態讀寫)。
*   **`ObservationSkill` (觀察型技能)**
    *   **職責**: 不改變環境，僅從環境中萃取與計算資訊。**最佳實踐是將觀察到的關鍵資訊註冊/更新至自身的狀態樹 (State Registry) 中**，而非單純回傳。
    *   **背景感知迴圈 (Sensory Loop)**: 此類技能可設定為**依據特定頻率在背景定時執行 (Tick/Cron)**。它就像 Agent 的自律神經系統，持續掃描四周並即時刷新狀態表（例如每 5 秒更新 `nearest_enemy_pos`）。
    *   **範例**: `ScanSurroundingsSkill` 在背景定時尋找最近的樹木，並執行 `this.state.update('nearest_tree_pos', pos)`。如此一來，行動技能 (ActionSkill) 在啟動時，就能直接從狀態表中拿到最新座標，徹底實現感知與行動的非同步解耦。
*   **`ActionSkill` (行動型技能)**
    *   **職責**: 直接對環境發出改變，並消耗時間。
    *   **範例**: `MineBlockSkill`, `CraftItemSkill`。
    *   **輸出**: 回傳成功與否及執行 Log。
*   **`CompositeSkill` (複合型技能)**
    *   **職責**: 組合多個 Observation 與 Action 技能，達成高階目標。
    *   **範例**: `BuildWoodenHouseSkill` (包含尋路、找木頭、放置方塊)。

---

## 3. Agent 技能開發套件 (Skill SDK Exposure)
為了確保 Agent 在使用 `CreateCodeSkillTool` 時不會瞎猜 API，系統會主動暴露一份經過精簡的型別定義檔（例如 `EmbodiedSDK.d.ts`）給 Agent。
Agent 的 System Prompt 中會動態注入這份 SDK 的介面：

```typescript
// 暴露給 Agent 閱讀的 SDK 範例
declare class BaseSkill {
    protected readonly bot: BotManager;
    protected readonly state: StateRegistry;
    execute(args: any): Promise<any>;
}
```

Agent 在撰寫 CodeSkill 時，可以自由讀取與修改自身狀態數值：
```typescript
class GatherWoodSkill extends ActionSkill {
    async execute(args: any) {
        // 讀取自身狀態
        const woodCount = this.state.get('wood_gathered') || 0;
        // 執行外部行為
        await this.bot.executeCommand('tree cut here');
        // 更新自身狀態
        this.state.set('wood_gathered', woodCount + 1);
        return "Gathered 1 wood block.";
    }
}
```

---

## 4. 生命週期與作用域 (Scope & Sandbox)
1. **綁定機制**:
   新生成的 CodeSkill 檔案是被寫入在特定 Agent 或是該 Session 的 `Workspace` (沙盒目錄) 中，例如 `/workspace/session-xxx/agent-yyy/skills/GatherWoodSkill.ts`。這保證了不同 Agent 間的創新不會互相污染。
2. **動態載入**:
   使用 `ExecuteCodeSkillTool` 執行時，系統利用動態 Import 即時載入該 TS 模組，並透過 `try/catch` 沙盒捕捉執行期錯誤。
3. **錯誤反思 (Reflection)**:
   若執行失敗，拋出的 Exception 堆疊 (Stack Trace) 會直接回傳給 Agent。Agent 透過 `UpdateCodeSkillTool` 自行修復該腳本，直到成功為止。
4. **晉升至全局知識庫 (VectorDB Promotion)**:
   當一個 CodeSkill 被 Agent 標記為「高度穩定且常用」時，它將被抽取特徵向量，正式寫入跨 Session 的全局向量技能庫中，供未來所有的 Agent 查詢與重複利用。
