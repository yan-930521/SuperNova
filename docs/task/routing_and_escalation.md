# 任務路由與動態升級設計 (Task Routing & Escalation Design)

SuperNova 系統依賴 Supervisor Agent (SA) 進行任務的集中分發與調度，採用 **混合路由架構 (Hybrid Routing Architecture)**。

## 1. 智慧路由與模組化推理 (Smart Routing & Modular Reasoning)
SA 不再依賴單一大型 System Prompt，而是利用 `InferenceEngine` 針對特定場景調用「專家推理模組」。

### 1.1 初始路由模組 (Routing Specialist)
- **觸發時機**: 接收到新目標。
- **組件**: `prompts/reasoning/sa_router.md` + `RoutingDecisionSchema`。
- **行為**: 根據 LLM 語意判定，輸出強型別的 `templateType` 與推薦理由。

## 2. 異常上報與智慧換檔 (Escalation & Gear Shifting)
當 Sub-Agents 回報 `EscalationReport` 時，SA 啟動換檔模組進行二次決策。

### 2.1 換檔專家模組 (Gear-Shift Specialist)
- **觸發時機**: 監聽到 `AgentEvents.Flow.Escalate`。
- **組件**: `prompts/reasoning/sa_gear_shifter.md` + `EscalationDecisionSchema`。
- **行為**: 分析異常原因（如：Scope Creep, Timeout），決定是否升級任務（如：Simple -> Standard）或發起 Emergency 修復流程。

1. **範圍溢出 (Scope Creep)**
   - **情境**: DA 執行 `Simple` 任務時，發現涉及核心架構修改或多檔案牽連。
   - **行為**: DA 中斷任務，回傳 `EscalationReport` 給 SA。SA 評估後將其升級為 `Standard` 或 `Complex`，強制引入 PA 進行重新規劃。
2. **解法受阻 (Solution Blocked)**
   - **情境**: CA 連續多次拒絕 DA 的產出，或現有資源無法解決。
   - **行為**: CA 回傳 `EscalationReport`。SA 評估後，可能換檔為 `Exploratory`，發起多個 DA 並行尋找不同解法。
3. **系統性崩潰 (System Crash)**
   - **情境**: 執行過程中遭遇致命編譯錯誤或環境異常。
   - **行為**: 流程中斷並警報 SA。SA 暫停當前規劃，立即發起 `Emergency` 任務，透過 DA 的 reAct 模式排除故障，修復後再恢復主流程。
