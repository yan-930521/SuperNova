# SuperNova 系統架構 (System Architecture)

## 1. 系統概述
SuperNova 是一個基於事件驅動與 PDCA 循環的代理蜂群系統。它採用分層架構，通過全局運行時 (Global Runtime) 管理組件生命週期，並利用 AI 推理引擎實現自主規劃與任務自癒。

本系統的核心理念是將「認知」與「執行」解耦，透過標準化的通訊協議讓多個專業代理人協同完成複雜任務。

## 2. 核心分層與詳細定義

### 2.1 Agent 層 (`src/agent/`)
定義代理基類與 PDCA 專業角色。
- **詳情請參閱**: [Agent 角色定義](agent/roles.md)
- **核心角色**: 
    - **Supervisor**: 系統中樞，負責路由與分發。
    - **Planning**: 邏輯拆解，產出任務圖譜。
    - **Doing**: 具體執行，具備 ReAct 推理能力。
    - **Checking**: 質量門禁，執行結果審核。
    - **Acting**: 持續改進，經驗標準化。

### 2.2 應用層 (`src/application/`)
提供業務邏輯服務，協調各項領域資源。
- **記憶服務**: 管理 L1/L2/L3 記憶的生命週期。
- **任務服務**: 處理任務的持久化與狀態追蹤。
- **會話服務**: 管理用戶會話與上下文隔離。

### 2.3 領域層 (`src/domain/`)
定義系統的核心實體，確保業務邏輯的純粹性。包含任務 (Task)、記憶 (Memory) 與用戶 (User) 的模型定義。

### 2.4 基礎設施層 (`src/infra/`)
提供系統支撐能力。
- **推理引擎**: 執行 LLM 推理與結構化輸出解析。
- **持久化層**: 基於文件系統的數據儲存。
- **監控脈搏**: [PulseEngine](task/self_healing.md) 負責心跳偵測與定期任務。

### 2.5 核心層 (`src/core/`)
系統的基座，提供依賴注入 (DI) 容器、生命週期管理與 [非同步事件總線 (EventBus)](agent/collaboration.md)。

---

## 3. 核心運作機制

### 3.1 PDCA 閉環協作
系統透過事件驅動模式推動任務流轉，每個階段皆由專業代理負責並產出驗證標準。
- **詳情請參閱**: [PDCA 閉環流程](agent/pdca_loop.md) | [代理協作協議](agent/collaboration.md)

### 3.2 三層記憶體架構 (Memory Matrix)
系統採用分層記憶體以平衡效能與長效知識儲存。
- **L1 Blackboard (黑板)**: 存放即時變數，採用 Key-Only 投影策略。 [詳情](memory/L1.md)
- **L2 Fact (事實)**: 存放已驗證的長期事實。 [詳情](memory/L2.md)
- **L3 SOP (操作手冊)**: 存放標準化作業程序。 [詳情](memory/L3.md)

### 3.4 持久化與儲存結構 (Persistence)
系統採用「會話中心化」的目錄結構，確保數據隔離與跨會話知識複用。
- **存儲路徑**:
    - `workspace/memory/L2_global/`: 全系統共用事實庫 (JSONL)。
    - `workspace/sessions/<sessionId>/`: 會話專屬空間。
        - `blackboard.json`: L1 即時狀態（單一 JSON）。
        - `L2_session/`: 本次會話專屬事實。
        - `tasks/`: 任務元數據、狀態機與執行歷史。
- **檢索原則**: 遵循「局部優先」策略 (L1 -> L2_session -> L2_global)。

---

## 4. 當前進度 (Current Progress)
*(以下進度反映真實代碼實現狀態)*

### `src/`
- `index.ts`: 系統入口，啟動示範。
- **`runtime/`**
    - `GlobalRuntime.ts`: **GlobalRuntime** (單例)
        - `start()`: 初始化所有組件。
        - `stop()`: 優雅關閉。
- **`core/`**
    - **`container/`**
        - `ComponentContainer.ts`: **ComponentContainer**
            - `register(name, instance)`: 註冊組件。
            - `boot()`: 啟動所有組件生命週期。
    - **`lifecycle/`**
        - `ILifecycle.ts`: 生命週期介面。
    - **`messaging/`**
        - `MessageBus.ts`: **EventBus**
            - `publish(event)` / `subscribe(type, handler)`: 非同步事件廣播。
            - `send(command)`: 指令發送。
- **`infra/`**
    - `LogManager.ts`: **LogManager** (Recorder)
        - `record(action, message, context)`: 結構化操作紀錄。
    - `PulseEngine.ts`: **PulseEngine**
        - `tick()`: 發布系統脈搏事件。
        - `watchTask(taskId, timeout)`: 任務心跳監控。
    - `ModelRegistry.ts`: **ModelRegistry** & **InferenceEngine**
        - `infer(state, schema, options)`: 執行結構化推理。
    - **`persistence/`**
        - `IRepository.ts`: 儲存庫介面定義。
        - **`filesystem/`**: 各種 FileSystem Repository 實現。
- **`agent/`**
    - `BaseAgent.ts`: **BaseAgent** (抽象類)
        - `setupSubscriptions()`: 定義事件監聽。
    - **`roles/`**
        - `SupervisorAgent.ts`: **SupervisorAgent** - 中樞。
        - `PlanningAgent.ts`: **PlanningAgent** - 規劃者。
        - `DoingAgent.ts`: **DoingAgent** - 執行者。
        - `CheckingAgent.ts`: **CheckingAgent** - 審核者。
        - `ActingAgent.ts`: **ActingAgent** - 改善者。
- **`application/`**
    - **`memory/`**: **MemoryService**
    - **`identity/`**: **UserService**
    - **`session/`**: **SessionService**

---

## 4. 當前進度 (Current Progress)

### 已完成模塊 (Completed)
- [x] **系統基礎建設**: 
    - [x] 組件容器 (DI) 與生命週期管理。
    - [x] 非同步事件總線 (EventBus)。
    - [x] 結構化日誌系統 (JSONL Recorder)。
    - [x] 全局運行時 (Global Runtime) 組合根。
    - [x] **通訊標準化**: 實作 `traceId` 與 `spanId` 追蹤機制。
- [x] **監控與事件**:
    - [x] 脈搏引擎 (PulseEngine) 定期觸發與超時監控 (支援 Trace 追蹤)。
- [x] **Agent 體系**:
    - [x] 代理基類 (BaseAgent) 定義。
    - [x] 五大專業角色 (Supervisor, Planning, Doing, Checking, Acting) 通訊骨架。
- [x] **數據持久化**:
    - [x] 文件系統存儲 (FileSystem Repository) 基礎實作。
    - [x] 層級式記憶存儲 (L1/L2/L3 Memory Repository) 基礎結構。
- [x] **工具系統**:
    - [x] 工具註冊表 (ToolRegistry) 與標準工具集 (File, Web, System) 骨架。

### 待優化 (TODO)
- [ ] **認知與上下文實裝**:
    - [ ] **ContextService 完整對接**: 實作從 MemoryService 動態獲取 L1 黑板 Keys 並注入 Prompt。
    - [ ] **DoingAgent 語義對齊**: 實作 L3 SOP 與 L1 黑板數據的自動掛接邏輯。
- [ ] **自癒機制實裝**:
    - [ ] **Level 1**: 任務 3x3 自癒決策 - 節點原地重試機制。
    - [ ] **Level 2**: 認知重規劃 (Cognitive Re-plan) 機制。
    - [ ] **Level 3**: 人工介入 (Human-in-the-loop) 暫停與恢復。
- [ ] **長期管理 (Trigger/Hook) 邏輯**:
    - [ ] **TODO**: 討論觸發後是啟動完整 PDCA 鏈還是執行輕量化反應。
- [ ] **Agent 核心推理**: 
    - [ ] 為五大角色編寫並測試具體的 LLM System Prompts 與推理路徑。
    - [ ] 打通 `DoingAgent` 的實際工具執行 (Tool Execution) 鏈路。
- [ ] **記憶與隔離**:
    - [ ] 完善 MemoryService 的 Session 隔離機制（目前為跨 Session 共用）。
    - [ ] 實作 L1 -> L2 的事實沉澱與摘要算法。
- [ ] **前端界面**: 完成 Web UI 監控面板與交互終端。
