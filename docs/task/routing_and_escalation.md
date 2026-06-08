# 任務路由與動態升級設計 (Task Routing & Escalation Design)

SuperNova 系統依賴 Supervisor Agent (SA) 進行任務的集中分發與調度，採用 **混合路由架構 (Hybrid Routing Architecture)**。

## 1. 初始路由 (Initial Routing)
SA 作為唯一入口，在接收使用者輸入後，透過 LLM 的語義理解，在呼叫 `DispatchTask` 工具時「順便」決定最合適的初始模板（如 `Simple`, `Standard` 等）。預設信任 LLM 的直覺，以最快速度啟動系統。

## 2. 異常上報與 SA 集中換檔 (Escalation to SA)
系統不允許 Sub-Agents (PA, DA, CA, AA) 自行變更任務模板。當遇到阻礙時，必須產出 `EscalationReport` 將決策權交還 SA。

**換檔行為 (Gear Shifting)**：
SA 接收到報告後，會標記該任務的 `TaskFlow.isEscalated = true`，並根據反饋重新生成或更新 `TaskFlow` 實體（例如將 `templateType` 從 `Simple` 改為 `Standard`），從而改變後續的執行路徑。

1. **範圍溢出 (Scope Creep)**
   - **情境**: DA 執行 `Simple` 任務時，發現涉及核心架構修改或多檔案牽連。
   - **行為**: DA 中斷任務，回傳 `EscalationReport` 給 SA。SA 評估後將其升級為 `Standard` 或 `Complex`，強制引入 PA 進行重新規劃。
2. **解法受阻 (Solution Blocked)**
   - **情境**: CA 連續多次拒絕 DA 的產出，或現有資源無法解決。
   - **行為**: CA 回傳 `EscalationReport`。SA 評估後，可能換檔為 `Exploratory`，發起多個 DA 並行尋找不同解法。
3. **系統性崩潰 (System Crash)**
   - **情境**: 執行過程中遭遇致命編譯錯誤或環境異常。
   - **行為**: 流程中斷並警報 SA。SA 暫停當前規劃，立即發起 `Emergency` 任務，透過 DA 的 reAct 模式排除故障，修復後再恢復主流程。
