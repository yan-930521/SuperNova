---
title: 每日總結與情景記憶 (Daily Summary & Episodic Memory)
version: 0.1.0
status: APPROVED
last_updated: 2026-08-12
related_codes:
  - src/core/memory/MemoryManager.ts
  - src/core/memory/prompt.ts
related_docs:
  - ../core/memory.md
  - graph_memory.md
---

# 每日總結與情景記憶 (Daily Summary)

本文件定義 SuperNova 系統中如何透過後台非同步機制，將代理人的短期對話歷史（Short-term History）濃縮為長期存放的巨觀情境記憶（Episodic Memory）。

## 1. 核心設計理念

當對話持續進行，即使我們有 `DataBlock` 卸載機制與 LRUCache，無上限增長的歷史對話檔案 (`history.jsonl`) 依然會拖垮系統初始化速度與檢索效率。因此，系統引入了**換日輪替 (Log Rotation)** 與 **AI 總結 (Daily Summary)** 機制。

## 2. Tick 心跳引擎與換日邏輯 (`handleTick`)

系統不依賴外部的作業系統 Cron Job，而是內建透過 `RuntimeKernel` 驅動的 `Tick` 心跳引擎來計算換日時間。

1. **活動追蹤**：`MemoryManager` 內部維護一個 `lastMessageTimes` 字典，記錄每個 Session 最後一次收到訊息的時間。
2. **換日條件判定**：每次 `Tick` 觸發時，系統會檢查當前時間是否跨越了預設的換日線。
3. **防打斷靜默機制 (`daily_optimization_idle_threshold_ms`)**：為了避免在 Agent 激烈對話中途強行換日導致上下文截斷，系統要求該 Session 必須「閒置」超過指定的毫秒數（例如 5 分鐘無新訊息），才會將其加入 `pendingOptimizations` 佇列進行換日與總結。

## 3. 每日總結流程 (Daily Optimization)

一旦 Session 滿足換日條件並進入優化佇列，`MemoryManager` 會在背景執行以下步驟：

1. **多代理人遍歷**：主動向 Repository 查詢該 Session 下的所有代理人 (`listAgentsForSession`)，不遺漏任何子分身。
2. **LLM 總結產生**：針對每個 Agent，提取其未總結的對話歷史，使用 `SESSION_SUMMARY_PROMPT` 呼叫 LLM，產生該代理人今日工作與情境的 Markdown 總結報告。
3. **記憶沉澱**：將產生的總結報告寫入特定資料夾（通常以日期與 Agent ID 命名），作為長期的情境記憶。
4. **歷史輪替 (Log Rotation)**：將當前的 `history.jsonl` 更名為帶有日期後綴的歸檔檔案（如 `history_20260812.jsonl`），並清空當前記憶體中的歷史記錄，為新的一天準備乾淨的上下文。

## 4. Feature Flags 開關

在 `Config.ts` 中可控制此機制的運作：
- `enable_daily_summary`：總開關，決定是否利用 LLM 產生 Markdown 每日總結以及是否執行歷史檔輪替。
