# SuperNova 2.0 快速上手指南 (Quick Start)

歡迎使用 SuperNova 2.0。這是一份為開發者（與 AI 協作者）準備的極簡索引。

---

## 🚀 系統啟動與開發
本專案已全面遷移至 **Bun** 高性能運行時。

1.  **安裝依賴**：`bun install`
2.  **啟動互動終端 (Demo)**：`bun run scripts/chat-demo.ts` 
    *(推薦：這是體驗 MainAgent 與 JIT 任務系統的最佳入口)*
3.  **啟動標準入口**：`bun start`
4.  **執行測試**：`bun test`
5.  **類型檢查**：`bun run lint`

---

## 🏗️ 核心架構：EMR + 雙層總帳模式
本專案採用 **「Entity-Manager-Repository」** 三層架構實現模組化，並分為對話與執行雙層：

1.  **Entity (實體 - `src/models/`)**：包含業務邏輯與狀態的對象 (如 `Session`, `Task`, `TaskGraph`)。
2.  **Manager (管理者 - `src/manager/`)**：控制實體生命週期與調度 (如 `TaskManager`, `SessionManager`)。
3.  **Repository (儲存庫 - `src/infra/storage/`)**：負責數據持久化。
4.  **Pulse Engine (觀測層)**：提供系統心跳、超時偵測與狀態觸發。

---

## 📂 目錄結構導覽

### 核心邏輯
-   `src/runtime/`：系統啟動入口 (`GlobalRuntime`)。
-   `src/manager/`：四大控制器 (User, Session, Task, Agent)。
-   `src/models/`：業務領域模型。
-   `src/task/`：JIT 即時規劃邏輯與 LLM 推理引擎 (`TaskPlanner`)。
-   `src/agent/`：基於 ReAct 的代理實現 (`BaseAgent`, `MainAgent`, `WorkerAgent`)。

### 基礎設施
-   `src/infra/types/`：**系統憲法**。定義所有 DTO 與介面。
-   `src/infra/storage/`：持久化實作。
-   `src/infra/`：通訊總線 (`EventBus`) 與脈搏引擎 (`PulseEngine`)。

### 其他
-   `agents/`：Agent 參數配置檔案 (JSON)。
-   `prompts/`：動態提示詞模版 (如 `replan.md`, `identity/`)。
-   `workspace/`：運行時生成的數據、日誌與任務狀態。
-   `web/`：視覺化控制面板 (Tailwind + React 規劃中)。

---

## 💡 開發備忘
-   **體驗 3x3 自癒機制**：在 `chat-demo.ts` 中下達一個會報錯的目標（例如讀取不存在的檔案），觀察終端機日誌中的 `Retrying task` 與 `Triggering cognitive re-plan`。
-   **新增功能**：先在 `src/infra/types/` 定義協議。
-   **更換儲存**：在 `src/infra/storage/` 實作介面，於 `GlobalRuntime` 切換注入。
-   **詳細架構**：請參閱 `docs/ARCH.md` 與 `docs/DEVELOPMENT_ROADMAP.md`。