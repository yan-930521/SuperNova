---
title: Minecraft 具身智能模擬場景
version: 0.1.0
status: APPROVED
last_updated: 2026-07-20
author: Antigravity & User
related_codes: 
  - ../../demo/minecraft/index.ts
  - ../../src/core/agent/EmbodiedAgent.ts
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
---

# Minecraft 具身智能模擬場景 (Minecraft Embodied Agent Scenario)

本文件描述了 SuperNova 系統如何將 `EmbodiedAgent` 連接至真實的環境模擬器中，以 Minecraft (基於 `mineflayer` 函式庫) 作為我們的具身智能 (Embodied AI) 測試沙盒。

## 1. 架構概念與邊界

在 SuperNova 中，`EmbodiedAgent` 作為智能實體的「大腦」，負責感知上下文並規劃行動。而 `mineflayer` 則是「軀殼與感官 (Body & Sensors)」，負責直接與虛擬世界互動。兩者之間**完全透過 `EventBus` 與 `DataBlock` 進行解耦通訊**。

*   **大腦 (Brain)**：`EmbodiedAgent`，維護與管理記憶，處理 `EventBus` 傳來的感官資料，並思考後發出行動命令。
*   **軀殼 (Body)**：`mineflayer` Bot 實例，連接至 Minecraft Server。
*   **神經網路 (Nervous System)**：`EventBus`。負責路由雙方的訊息。

## 2. 雙向通訊流程 (Two-way Communication)

### A. 感官映射 (Sensors -> Brain)
當 Minecraft 世界中發生事件時（例如收到聊天訊息 `chat`、機器人出生 `spawn`），Demo 腳本中的適配器會攔截這些事件，將其封裝為 `DataBlock` (intent: `SENSOR_INPUT`)，並指定 `targetId` 為該 `EmbodiedAgent`。接著發佈到 `EventBus`。
透過 `SessionManager` 的統籌，這些 `DataBlock` 會被放入會話的 `inboxBuffer`，並喚醒 `EmbodiedAgent` 進行處理。

### B. 行動映射 (Brain -> Actuators)
當 `EmbodiedAgent` 思考完畢，決定採取行動時（例如說話或移動），它會發出一個 `DataBlock` (intent: `ACTION_COMMAND`)。
Demo 腳本中的適配器會訂閱 `EventBus` 的 `AgentMessage` 事件，當收到該意圖的資料塊時，解析其 `controlPayload`，並轉換為 `mineflayer` 原生 API 調用 (如 `bot.chat(msg)` 或 `bot.setControlState()`)。

## 3. 環境與部署配置

本 Demo 設計為無頭環境運行，預設連線至離線 (Offline mode) 的 Minecraft Server。

**依賴的環境變數**：
*   `MINECRAFT_HOST`：Minecraft 伺服器地址 (預設：`127.0.0.1`)
*   `MINECRAFT_PORT`：Minecraft 伺服器通訊埠 (預設：`25565`)
*   *(選擇性)* 腳本中硬編碼了 username (如 `SuperNovaBot`)，以符合離線伺服器的快速測試需求。

## 4. 實作規劃 (`demo/minecraft/index.ts`)

1. **依賴注入與內核啟動**：實例化 `RuntimeKernel`，並透過容器獲取 `SessionManager`、`AgentManager` 與 `EventBus`。
2. **會話建立**：透過 `SessionManager` 建立專屬的 Minecraft 測試會話。
3. **大腦喚醒**：使用 `AgentManager.spawnAgent` 以 `AgentType.EMBODIED` 喚醒機器人大腦。
4. **軀殼連接**：呼叫 `mineflayer.createBot()` 連接伺服器。
5. **神經綁定**：建立雙向的 `EventBus` 監聽器。

---
**設計總結**：此架構嚴格遵循了 SuperNova 內核的無狀態大腦設計，不將任何 `mineflayer` 相關的網路狀態耦合進 `BaseAgent`，達成了完美的環境解耦。
