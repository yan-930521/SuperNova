---
title: 具身智能模擬場景：Minecraft 機器人基礎整合
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes: 
  - ../../src/core/agent/EmbodiedAgent.ts
  - ../../src/package/underworld/index.ts
  - ../../src/package/underworld/BotManager.ts
  - ../../src/package/underworld/CommandRouter.ts
  - ../../src/package/underworld/commands/ChatCommand.ts
  - ../../src/package/underworld/commands/MoveCommand.ts
  - ../../src/package/underworld/commands/ObserveCommand.ts
  - ../../src/package/underworld/location/LocationRepository.ts
  - ../../src/package/underworld/tools/LandmarkTool.ts
  - ../../src/package/underworld/tools/MinecraftCommandTool.ts
  - ../../src/package/underworld/wrapper/SuperNovaBot.ts
related_docs:
  - ../../ARCH.md
  - ../agent/agent.md
---

# 具身智能模擬場景：Minecraft 機器人基礎整合

本文件描述了 SuperNova 系統針對 `EmbodiedAgent` 所設計的 Minecraft 基礎整合場景。旨在建立實體與遊戲世界的連線、事件監聽及基本控制機制。

## 1. 系統初始化與生命週期 (System Initialization & Lifecycle)

*   **物理世界優先 (Physical World First)**：`EmbodiedAgent` 的初始化必須嚴格等待其附屬的 Bot 實體在 Minecraft 伺服器中完全具現化（觸發 `spawn` 事件）並確認連線狀態（與容錯處理 `error`/`kicked`）後，才能將控制權交還給 Package 系統。這確保了在實體軀殼尚未完全就緒前，不會開始接收與處理來自系統的調度指令與世界事件。
*   **安全關機 (Graceful Stop)**：在系統關閉時，呼叫 `BotManager` 的 `stop()` 或相關實體的清理流程，終止機器人所有動作並離線，確保狀態重置。

## 2. 機器人管理 (BotManager)

`BotManager` 負責管理所有代理人的連線狀態以及與 `mineflayer` 的底層互動：
*   **連線與錯誤處理**：處理 `spawn`、`error` 及 `kicked` 等生命週期事件。
*   **權限檢查與初始化**：檢查代理是否具備 OP 權限 (透過 `/give` 測試)，若有則自動派發初始裝備 (鑽石套裝、工具等) 並給予飽食與生命回復狀態。
*   **上下文管理**：維持 `CommandContext` 以便其他指令存取機器人與事件系統。

## 3. 指令路由系統 (CommandRouter & Commands)

本模組實作了基於 `ICommand` 介面的路由系統，提供以下內建指令：
*   **`ObserveCommand`**：使代理能夠觀察周遭環境的實體與方塊。
*   **`MoveCommand`**：控制代理在地圖中移動至指定座標。
*   **`ChatCommand`**：(`sendChat()`) 讓代理人發送訊息到遊戲內的聊天頻道，與玩家或其他實體互動。

## 4. 環境與工具整合 (Environment & Tools)

*   **位置系統 (LocationRepository)**：用於存儲與管理地標與座標資訊，協助代理進行空間導航。
*   **專屬工具**：提供 `LandmarkTool` 及 `MinecraftCommandTool` 供代理調用，以發揮實體化的環境影響力。
*   **事件整合**：結合 `EventBus`，透過發送與接收 `DataBlock` 將遊戲世界內的事件同步回系統大腦，並可廣播至其他代理。

---

> 完整的 Underworld 社會模擬規劃（天職系統、禁忌目錄、多角色生態）請參閱 [Underworld 社會模擬規劃](../../todo/underworld_society.md)。
