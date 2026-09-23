---
title: 具身互動與環境感知器官 (Embodiment Module)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 具身互動與環境感知器官 (Embodiment Module)

具身模組 (`src/core/agent/modules/EmbodimentModule.ts`) 是代理人連結外部環境（物理世界硬體、機器人、虛擬沙盒遊戲如 Minecraft、或數位作業系統）的感知與動作器官（優先級 `priority: 70`）。

---

## 1. 核心職責與架構定位

```mermaid
flowchart TD
    ExtWorld["外部實體 / 虛擬環境\n(物理機器人 / OS GUI / 沙盒遊戲)"] <--> Adapter["環境適配器 (Environment Adapter)"]
    Adapter -->|感測器串流 / 座標 / 視野| EM["EmbodimentModule (priority: 70)"]

    EM -->|注入 [7] ENVIRONMENT| Prompt["Prompt 引擎 (SystemPrompt)"]
    EM -->|提供動作控制工具| Tools["模型可用工具 (Movement / Actions)"]
```

1. **環境狀態感知注入**：將當前的物理空間位置、周遭實體、感測器讀數轉換為結構化文字，注入提示詞之 `PromptSectionIndex.ENVIRONMENT = 7`。
2. **具身動作映射 (Action Mapping)**：為 LLM 提供標準化的高階動作調用工具，並即時轉譯為底層驅動協議。
3. **安全限幅與碰撞防禦**：在發送指令前執行邊界安全審查，防止破壞外部設備。

---

## 2. 提示詞段落注入 (`PromptSectionIndex.ENVIRONMENT = 7`)

模組在 `onBeforeStep` 中即時注入當前實體環境快照：

```markdown
# Physical / Virtual Environment State
- 當前位置座標: (X: 120.4, Y: 64.0, Z: -35.2)
- 周圍觀測實體: [ 工作台 (距離 1.5m), 儲物箱 (距離 3.2m), 友方角色 (距離 5.0m) ]
- 手持裝備與狀態: [ 鐵鎬 (耐久度 85%), 生命值: 20/20, 飽食度: 18/20 ]
- 環境警示: 無危險敵對實體接近。
```

---

## 3. 模組內建工具清單 (`getTools`)

1. **`observe_environment`**：
   - 參數：`radius?: number, focusType?: string`
   - 功能：以特定半徑重新掃描周遭環境並刷新快取。
2. **`execute_physical_action`**：
   - 參數：`actionType: string, targetCoords?: number[], parameters?: Record<string, any>`
   - 功能：發送移動、抓取、操作或交互動作指令至底層適配器。
