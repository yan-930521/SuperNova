# Worker 執行單元 (Worker Execution Unit)

## 核心組件

### `Worker` (原子執行單元)
執行層專注於「Do」，與環境進行實際交互。

*   **職責**：具體的原子級操作（例如：API 呼叫、數據清洗、腳本執行、網頁爬取）。
*   **行為**：無狀態 (Stateless)、無歷史、完成即回收。負責將執行結果轉化為特定類型的 `DataBlock` 返回給事件層。本身不具備高階決策與排錯能力，僅受命於 Agent 或 Scheduler。
