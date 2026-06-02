# Blackboard 系統規格（SuperNova 0.3.0）

Blackboard（黑板系統）是 SuperNova 的結構化共享狀態中心，作為單一執行鏈中的「唯一真實狀態來源」。它負責記錄系統對問題的當前理解、決策歷程與執行進度。

Blackboard 是一個 **「純粹的記憶模組」**，它不參與決策或任務調度，僅負責提供透明的狀態顯示與資料交換。

---

# 1. 核心區塊 (The Seven Sections)

Blackboard 由以下七個核心區塊組成，分為「即時推理區」與「數據暫存區」。

## 1.1 Facts（事實）
已驗證的資訊。
- 來源：工具輸出、實體執行結果。
- 規則：增量式追加，不可隱式覆蓋。

## 1.2 Hypotheses（假設）
未驗證的推論或猜測。
- 作用：導引探索方向。
- 規則：驗證完成後可轉換（Promote）為 Fact。

## 1.3 Decisions（決策）
系統選擇的行動、策略或承諾的方向。
- 規則：必須記錄理由（Reasoning）。若策略改變，舊決策需標記為 `superseded`（被取代）。

## 1.4 Open Questions（未解問題）
當前阻塞推理或執行的不確定性。
- 作用：作為推理驅動的主要來源，引導工具調用。

## 1.5 Task Graph（任務圖）
由 `TaskService` 提供，顯示任務鏈的結構。
- 包含：任務節點、類型（Reasoning/Execution）、相依關係。

## 1.6 Execution State（執行狀態）
由 `TaskService` 提供，顯示當前執行進度。
- 包含：當前任務、已完成任務、失敗或阻塞狀態。

## 1.7 Variables (KV Store) —— [漸進式披露]
大型數據或具體內容的暫存區。
- **披露機制**：系統提示詞中僅顯示 Key 名稱。
- **獲取方式**：Agent 必須透過工具主動查詢特定 Key 的 Value。

---

# 2. 更新與存取規則

### 2.1 增量與一致性
- 所有更新均為增量式，確保認知歷程的可追溯性。
- 當新的 Fact 與舊的 Decision 衝突時，Agent 應主動標記舊資訊為 `superseded`。

### 2.2 漸進式披露流程
1. **感知**：Agent 在 Prompt 中看到 Facts 摘要、任務進度與可用 Variables 列表。
2. **檢索**：若 Agent 需要特定變數的具體數值，使用 `read_blackboard_var`。
3. **行動**：執行工具。
4. **回饋**：將結果寫入 Facts 或 Variables。

---

# 3. 工具介面 (`blackboard_tool`)

Agent 透過此工具與黑板互動：
- `get_details(section)`: 獲取特定區塊的完整內容。
- `get_variable(key)`: 讀取大型數據內容。
- `post_entry(section, content, metadata)`: 追加認知資訊。
- `set_variable(key, value)`: 存放數據暫存。

---

# 4. 生命週期

1. **初始化**：隨 `goal_dispatcher` 或任務鏈建立時生成。
2. **演進**：各個 Worker Agent 在執行過程中持續回寫認知與數據。
3. **同步**：跨 Agent 的認知對齊。
4. **歸檔**：任務鏈結束後，Blackboard 作為執行記錄持久化存儲。
