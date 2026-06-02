# PDCA 閉環協作流程 (PDCA Loop Workflow)

系統透過五大 Agent 角色，實現了完整的 PDCA (Plan-Do-Check-Act) 持續改進循環。

## 1. Plan (規劃) - PlanningAgent
- 接收 `SupervisorAgent` 的目標。
- 檢索 **Memory L3 (SOP)** 與 **L2 (事實)**。
- 產出執行路徑 (TaskGraph)。

## 2. Do (執行/行動) - DoingAgent
- **核心職責**: 根據規劃內容執行具體行動（Action）。
- **語義對齊**: 當執行包含 L3 SOP 的任務時，負責將 SOP 中的程序化指令與 L1 黑板中的實體 Key 進行語義對齊與資料掛接。
- **實體產出**: 產生代碼、檔案、API 呼叫，並將執行狀態與關鍵結果寫回 Blackboard。

## 3. Check (檢核) - CheckingAgent
- 對 `DoingAgent` 的結果進行質量審核。
- 比對目標與產出是否一致。

## 4. Act (改善/標準化) - ActingAgent
- **核心職責**: 
    - 總結本輪成功作法並將其 **標準化**。
    - 針對失敗處進行修正。
- **記憶體寫入**: 
    - 成功的流程寫入 **L3 SOP**。
    - 確認的事實寫入 **L2 Fact**。
- **循環重啟**: 將改進建議作為下一輪 `PlanningAgent` 的基礎，啟動新的循環。
