---
title: 綜合模擬場景：HackerNews 抓取與 Discord 轉發
version: 0.1.0
status: APPROVED
last_updated: 2026-07-14
author: Antigravity & User
related_codes: []
related_docs:
  - ../architecture/agent/agent.md
  - ../architecture/core/event_bus.md
---

# 綜合模擬場景：HackerNews 抓取與 Discord 轉發

本文件透過一個具體的模擬場景，展示 SuperNova 系統中各個組件（`MainAgent`、`SubAgent`、`Worker`、`EmbodiedAgent`、`EventBus` 等）如何協同運作。

## 🎬 模擬場景設定

*   **用戶輸入 (User Input)**：「幫我抓取 HackerNews 首頁前五篇文章並總結，然後請我的 Discord 虛擬助理把總結發布到群組裡。」
*   **系統常駐實體**：
    1.  **`MainAgent`**: 全局協調者與大腦 (具備存取所有節點的上帝視角)。
    2.  **`EmbodiedAgent`** (ID: `DiscordBot_01`): 具備連接 Discord API `Body` 的永久型具身角色。

---

## 🔄 系統運作時間線 (Timeline)

### 階段 1：接收與拆解 (MainAgent)
1.  **觸發 (Trigger)**：系統將用戶的文字包裝成 `DataBlock (type: UserInput)`。
2.  **路由 (Routing)**：`EventBus` 依據預設路由，將此 DataBlock 投入 `MainAgent` 的 InboxBuffer 並發送中斷喚醒它。
3.  **決策 (Decision)**：`MainAgent` 讀取內容，發現這是一個複合任務。它利用上帝視角決定拆解為兩步：
    *   *(任務 A)* 爬蟲與總結（一次性工程任務，適合交給 `SubAgent`）。
    *   *(任務 B)* 呼叫虛擬助理發言（實體/環境互動任務，交給已存在的 `DiscordBot_01`）。
4.  **派生 (Spawn)**：`MainAgent` 派生出一個新的 `SubAgent` (ID: `Sub_Crawler_99`)，透過 DataBlock 將 *(任務 A)* 的上下文交給它。隨後 `MainAgent` 進入休眠。

### 階段 2：PDCA 循環與排程 (SubAgent & DAGScheduler)
5.  **[PLAN] 規劃**：`SubAgent` 醒來，調用工具 `create_task_graph` 生成 DAG 拓撲圖：
    *   `Task 1`：爬取 HN 網頁 (指派給 Worker: Crawler)
    *   `Task 2`：總結文章 (指派給 Worker: LLM_Summarizer，依賴 `Task 1`)
6.  **[DO] 執行**：`SubAgent` 調用 `dispatch_workers(wait_mode="ALL")`，將任務圖交給 `DAGScheduler`，隨後主動釋放資源進入**掛起 (Suspend)**。
7.  **調度 (Scheduling)**：`DAGScheduler` 控制無狀態的 `Worker` 依序完成爬蟲與總結，產生最終的文字結果。若中途逾時，將觸發 TTL 熔斷機制。
8.  **[CHECK] & [ACT] 檢視與回報**：`EventBus` 將 Worker 結果包裝成 `DataBlock` 喚醒 `SubAgent`。`SubAgent` 檢視無誤 (Success) 後，將結果封裝成新的 DataBlock 發送回給 `MainAgent`。
9.  **GC 回收**：`SubAgent` 完成使命，實體與臨時記憶被系統自動銷毀。

### 階段 3：跨節點路由與具身智能 (EventBus & EmbodiedAgent)
10. **合併 (Merge)**：`MainAgent` 被喚醒並收到總結結果，將其 Deep Merge 到自己的長期記憶中。
11. **點對點路由 (P2P Routing)**：`MainAgent` 產生一個新的 `DataBlock (type: Command)`，內容為「請發布這段總結」，並將 **Target ID 指定為 `DiscordBot_01`**。交由 `EventBus` 派發。
12. **環境注入 (Body Injection)**：`EmbodiedAgent` (`DiscordBot_01`) 被 `EventBus` 喚醒。此時系統強制動態注入它的 `Body` 狀態：
    *   `EnvPrompt`：「你現在位於 Discord 的 #general 頻道。當前在線人數 3 人。」
    *   `ActionTools`：`[discord_send_msg, discord_add_reaction]`
13. **環境互動 (Interaction)**：`EmbodiedAgent` 讀取來自 MainAgent 的指令，並結合自身的 `EnvPrompt` 判斷當下情境，決定調用 `ActionTools` 中的 `discord_send_msg("大家好，這是今日的 HN 總結：...")`。
14. **完成 (Completion)**：真實世界的 Discord 頻道送出了訊息。`EmbodiedAgent` 更新自身狀態，繼續在背景長期存活。`MainAgent` 記錄任務完成。
