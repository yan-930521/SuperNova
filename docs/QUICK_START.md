# SuperNova 2.0 快速上手指南 (Quick Start)

歡迎使用 SuperNova 2.0。這是一個專為解決 AI Agent 長期運行中「上下文漂移」與「目標偏移」問題而設計的持久化多代理運行時系統。

---

## 🚀 環境要求與啟動

本專案全面採用 **Bun** 作為核心運行時，以追求極致的啟動速度與開發體驗。

### 1. 安裝環境
- 安裝 [Bun](https://bun.sh/) (建議版本 v1.1.0+)
- 配置 `.env` 檔案（參考範例配置 LLM API Key）

### 2. 常用指令
- **安裝依賴**：`bun install`
- **啟動互動對話 (推薦)**：`bun run scripts/chat-demo.ts`
- **執行 JIT 任務展示**：`bun run scripts/task-demo.ts`
- **執行單元測試**：`bun test`
- **代碼格式化與檢查**：`bun run lint`

---

## 📂 關鍵檔案索引與目錄導覽

### 核心運行時 (Core Runtime)
- `src/runtime/GlobalRuntime.ts`: **系統組合根 (Composition Root)**。負責初始化所有 Manager、Repository 並完成依賴注入與事件掛鉤。
- `src/index.ts`: 程式啟動入口。
- `src/config/Config.ts`: 全局配置定義與環境變數管理。

### 代理系統 (Agentic Core)
- `src/agent/BaseAgent.ts`: 代理基底類。實現了核心的 ReAct 思考循環、工具調用邏輯與錯誤處理。
- `src/agent/MainAgent.ts`: **對話編排者**。負責與用戶交互，並透過 `TaskDispatcherTool` 將高階目標轉化為任務圖。
- `src/agent/WorkerAgent.ts`: **任務執行者**。專注於具體任務節點的執行，具備高度的上下文隔離性。
- `agents/`: 存放各個代理的角色設定檔 (JSON)，定義其身份、專業領域與可用工具。

### 管理者層 (Manager Layer)
- `src/manager/SessionManager.ts`: 管理用戶對話歷史與高階狀態摘要。
- `src/manager/TaskManager.ts`: **核心調度引擎**。管理任務生命週期、JIT 任務展開、依賴檢查與 3x3 自癒重試。
- `src/manager/AgentManager.ts`: 代理實例的工廠與生命週期管理。
- `src/manager/MemoryManager.ts`: 規劃中的記憶系統管理中心（支援短、中、長期記憶）。

### 任務與規劃 (Task & Planning)
- `src/task/TaskPlanner.ts`: 使用 LLM 進行目標拆解與任務圖生成。
- `src/models/TaskGraph.ts`: **執行總帳**。維護任務節點之間的依賴關係 (DAG) 與執行狀態。
- `src/models/Task.ts`: 單一任務節點的定義。

### 基礎設施 (Infrastructure)
- `src/infra/EventBus.ts`: 異步事件通訊中心。
- `src/infra/PulseEngine.ts`: **系統生命體徵監控**。負責心跳偵測、任務超時處理與自動化狀態 Hook。
- `src/infra/ModelRegistry.ts`: 統一的模型推理入口，支援結構化輸出 (Zod Schema)。
- `src/infra/types/`: 系統 DTO 與介面協議定義（系統憲法）。
- `src/infra/storage/`: 對稱式儲存庫實作 (FileSystem)，負責數據持久化。

### 工具集 (Tool System)
- `src/tool/ToolRegistry.ts`: 全局工具註冊表。
- `src/tool/core/`: 核心編排工具（如 `TaskDispatcherTool`, `ChainInfoTool`）。
- `src/tool/common/`: 通用能力工具（如 `TavilySearch`, `DeepThinking`）。
- `src/tool/file/`: 受控的檔案系統操作工具。

---

## 🧱 組件功能詳解

### 1. 雙層總帳 (Dual-Ledger)
- **會話層 (Session)**: 保持對話的精煉與目標的一致性。
- **任務層 (Task)**: 紀錄詳盡的工具呼叫數據 (OpLog) 與 Agent 內部的 ReAct 思考軌跡。

### 2. JIT (Just-In-Time) 任務系統
系統不會一次性生成所有細節步驟，而是先規劃「里程碑」，並在執行過程中根據即時反饋動態展開具體任務。

### 3. 3x3 自癒機制 (Self-Healing)
1. **Node Retry**: 單體任務失敗自動原地重試。
2. **Cognitive Re-plan**: 偵測到邏輯錯誤或重試耗盡，觸發 `TaskPlanner` 修正任務圖。
3. **STUCK 標記**: 最終失敗將狀態標記為 STUCK，等待人類介入或策略降級。

### 4. 脈搏引擎 (Pulse Engine)
透過定時 Tick 監控所有活躍任務。若 Agent 在執行工具時發生死鎖或異常超時，Pulse Engine 會強行回收狀態並觸發自癒流程。

---

## 📂 工作空間導覽 (Workspace)

- `workspace/logs/`: 系統運行日誌 (JSONL 格式)。
- `workspace/sessions/`: 存放各個對話的歷史與摘要。
- `workspace/tasks/`: 存放任務圖與具體節點的執行細節。
- `prompts/`: 核心提示詞模版庫，支持按場景動態加載。

---
*更多詳細資訊請參考 `docs/ARCH.md`。*