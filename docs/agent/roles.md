# Agent 五大角色定義 (Agent Roles) - v0.4.0

在 SuperNova 0.4.0 架構中，Agent 體系從通用的 Main/Worker 模式轉向高度專業化的五大角色分工，以解決 Context 漂移並提高執行精度。

## 1. SupervisorAgent (模組化推理編排器)
- **職責**: 
    - **對話式交互**: 作為系統唯一進入點，解析用戶意圖。
    - **模組化推理 (Modular Reasoning)**：不再依賴單一大型 Prompt，而是作為編排器，針對特定任務調用獨立的「專家推理模組」（如：路由專家、換檔專家）。
    - **任務路由與智慧換檔**: 利用 `InferenceEngine` 決定 `templateType`，並集中處理 Sub-Agent 的 `EscalationReport` 進行動態路徑修正。
    - **追蹤監控**: 持有 Swarm EventBus，負責跨任務鏈的 Trace 追蹤。
- **角色定位**: 系統指揮官 / 推理編排員。

## 2. PlanningAgent (分形架構師)
- **職責**: 
    - **分形拆解**: 接收目標並產出封裝於母任務 `subGraph` 中的 `TaskGraph`。
    - **SOP 整合**: 在規劃時自動檢索 `L3 SOP` 路徑，並將標準步驟植入任務圖。
    - **門禁定義**: 為每個子任務定義清晰的 `Success Criteria`。
- **角色定位**: 系統架構師。

## 3. DoingAgent (核心執行者)
- **職責**: 
    - **ReAct 執行**: 根據規劃節點執行工具操作，具備自我修正推理。
    - **共享寫入 (L1 Post)**: 執行中必須及時將發現的事實、代碼、中間變數寫入 L1 Blackboard。
    - **範圍預警**: 偵測 Scope Creep（如需改動過多檔案），主動停止並上報 SA。
- **角色定位**: 核心開發與操作工程師。

## 4. CheckingAgent (PDCA 質量門禁)
- **職責**: 
    - **認知對比**: 從 L1 加載 DoingAgent 的痕跡，比對 PlanningAgent 的驗證標準。
    - **流轉判定**: 決定任務是 `PASS` (進入 ACTING)、`FAIL` (回退 DOING) 還是 `ESCALATE` (上報 SA 換檔)。
- **角色定位**: 質量保證 (QA)。

## 5. ActingAgent (標準化與改善者)
- **職責**: 
    - **事實升遷 (L2 Promotion)**: 判定並將 `L2 Session Fact` 升遷為全系統共用的 `L2 Global Fact`。
    - **SOP 沉澱**: 將成功的執行路徑標準化為 `L3 SOP`。
    - **系統優化建議**: 總結執行痛點，作為下一輪規劃的改良基礎。
- **角色定位**: 知識管理與持續改進專家。
