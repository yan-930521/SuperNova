# 統一脈搏引擎設計 (Unified Pulse Engine Design)

## 1. 背景與目標
SuperNova 需要一個核心的「節律器」，負責驅動系統的週期性任務、監控代理（Agent）執行的健康狀況，並允許 Agent 與插件（Plugin）自定義觸發邏輯。本設計將原本重疊的 `PulseEngine` 與 `HookRegistry` 統合成一個「統一脈搏引擎」。

## 2. 核心架構 (Core Architecture)

### 2.1 PulseEngine (核心引擎)
- **職責**：
    - 提供系統時鐘（Tick），預設 1s 一次。
    - 管理全域狀態池（Global State Pool），作為數值檢查的真理來源。
    - 管理與執行兩類監控實體：`AgentHook` 與 `TaskHeartbeat`。
    - 作為事件轉運站，處理 Plugin 定義的自定義事件。

### 2.2 數據實體定義
#### 2.2.1 AgentHook (自主掛鉤)
由 Agent 或 Plugin 動態建立，具備以下觸發類型：
- **INTERVAL**: 每隔固定的 Tick 次數觸發。
- **THRESHOLD**: 監控狀態池中的數值，滿足表達式時觸發（如 `state.cpu > 80`）。
- **EVENT**: 監聽特定事件（含 Plugin 自訂事件），檢查 Payload 後觸發。
- **動作 (Action)**: 觸發後執行的行為，如 `EMIT_EVENT`, `START_TASK`, `LOG`。

#### 2.2.2 TaskHeartbeat (任務心跳)
- **監控對象**: `TaskManager` 中的運行中任務。
- **邏輯**: 每個 Tick 檢查 `now - lastActive > threshold`。
- **超時動作**: 通知 `TaskManager` 標記任務失敗。

## 3. 運作流程 (Execution Flow)

### 3.1 狀態池更新 (Pull/Push)
- **Push**: Plugin 或 Agent 調用 `pulse.setState(key, value)` 更新數據。
- **Pull**: (可選) Hook 可配置一個獲取函數，由 Pulse 在檢查前調用。

### 3.2 節律循環 (The Tick)
1. **更新時鐘**: `tickCount++`。
2. **狀態檢查**: 遍歷 `THRESHOLD` Hooks，從狀態池取值並求值。
3. **定時檢查**: 遍歷 `INTERVAL` Hooks。
4. **超時檢查**: 檢查 `TaskWatchList` 中的任務心跳。
5. **事件響應**: 當事件發生時，Pulse 立即過濾並觸發相關 `EVENT` Hooks。

## 4. Plugin 支持 (Plugin Support)
- Plugin 載入時可調用 `pulse.registerCustomEvent(name)`。
- Plugin 可向狀態池註冊特定的 Namespace（如 `plugin.weather.*`）。
- 允許 Plugin 注入預定義的「系統 Hook」。

## 5. 配置參數
- `DEFAULT_TICK_INTERVAL`: 1000ms.
- `DEFAULT_TASK_TIMEOUT`: 30,000ms.
- `MAX_HOOKS_PER_AGENT`: 50 (防止資源耗盡)。

## 6. 測試策略
- **靜態檢查測試**: 驗證 Hook 註冊與狀態池讀寫。
- **定時觸發測試**: 驗證 `INTERVAL` 是否精準。
- **閾值觸發測試**: 模擬狀態變更，驗證 `THRESHOLD` 觸發。
- **超時測試**: 模擬任務停止回報心跳，驗證 `TaskManager` 收到失敗信號。
