---
title: 具身智能模擬場景：Minecraft 機器人基礎整合
version: 0.1.0
status: APPROVED
last_updated: 2026-08-10
related_codes: 
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

## 3. 行為與技能系統 (CodeSkill & SkillManager)

本模組廢棄了傳統的指令路由架構，全面改用動態且可自我進化的 `CodeSkill` 架構，由核心層的 `SkillManager` 統一管理：
*   **動態載入與快取 (LRUCache)**：所有執行的技能（如 `MoveSkill`, `ChatSkill`）都會經過 `SkillManager` 實例化並存入 `LRUCache` 以重複使用，減少記憶體浪費。
*   **背景感官迴圈 (ObservationSkill)**：專門設計的背景觀測技能（如 `ObserveSkill`, `RadarSkill`）會在啟動時自動掛載背景迴圈，當被踢出快取時也能優雅地 `stopSensoryLoop()` 終止執行，避免殭屍迴圈。
*   **基礎生存技能**：
    *   **`MoveSkill`**：控制代理在地圖中移動至指定座標或目標。
    *   **`ChatSkill`**：讓代理人發送訊息到遊戲內的聊天頻道，與玩家互動。
    *   **`MineSkill` / `TerrainSkill`**：基礎的環境改變與方塊互動能力。

## 4. 環境與記憶整合 (Environment & StateRegistry)

*   **專屬執行工具**：提供 `execute_code_skill`、`test_code_skill` 與 `read_code_skill` 供代理調用，讓代理能自主編寫、測試並執行新的 `CodeSkill` 以適應環境。
*   **地標與空間記憶 (LandmarkSkill)**：廢棄了獨立的 LocationRepository，所有的地標與位置資訊由 `LandmarkSkill` 直接讀寫 `EmbodiedAgent` 本身的 `StateRegistry`（長期記憶），達成狀態與大腦的深度綁定。
*   **事件整合**：結合 `EventBus`，透過發送與接收 `DataBlock` 將遊戲世界內的事件同步回系統大腦，並可廣播至其他代理。

---

> 完整的 Underworld 社會模擬規劃（天職系統、禁忌目錄、多角色生態）請參閱 [Underworld 社會模擬規劃](../../todo/underworld_society.md)。
