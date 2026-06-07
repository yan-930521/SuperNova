# SuperNova 系統架構 (System Architecture)

## 1. 系統概述
SuperNova 是一個基於事件驅動與 PDCA 循環的代理蜂群系統。它採用分層架構，通過全局運行時 (Global Runtime) 管理組件生命週期，並利用 AI 推理引擎實現自主規劃與任務自癒。

## 2. 核心分層
- **Agent 層 (`src/agent/`)**: 定義代理基類與 PDCA 專業角色 (Plan, Do, Check, Act)。
- **應用層 (`src/application/`)**: 提供業務邏輯服務，如任務調度、規劃協調與會話管理。
- **領域層 (`src/domain/`)**: 定義核心實體與業務對象。
- **基礎設施層 (`src/infra/`)**: 提供持久化、日誌、推理引擎與系統監控。
- **核心層 (`src/core/`)**: 提供 DI 容器、生命週期管理與消息總線。

---

## 3. 代碼架構樹 (Source Code Tree)

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
- [x] **監控與自癒**:
    - [x] 脈搏引擎 (PulseEngine) 定期觸發與超時監控。
    - [x] 任務 3x3 自癒決策 - Level 1 節點重試機制。
- [x] **Agent 體系**:
    - [x] 代理基類 (BaseAgent) 與 PDCA 角色定義。
    - [x] 指揮官代理 (SupervisorAgent) 通訊骨架。
- [x] **數據持久化**:
    - [x] 文件系統存儲 (FileSystem Repository) 針對 Agents, Memory, Sessions, Tasks, Users。
    - [x] 層級式記憶存儲 (L1/L2/L3 Memory Repository)。
- [x] **工具系統**:
    - [x] 工具註冊表 (ToolRegistry) 與多種標準工具 (文件、網路、系統)。

### 進行中/待優化 (In Progress / TODO)
- [ ] **Agent 實裝**: 完成 PDCA 各專業角色的具體 LLM 推理邏輯。
- [ ] **自癒進階**: 實現 Level 2 (認知重規劃) 與 Level 3 (人工介入) 機制。
- [ ] **記憶優化**: 完善 L1/L2/L3 記憶的滾動與檢索優化。
- [ ] **前端界面**: 完成 Web UI 監控面板與交互終端。
