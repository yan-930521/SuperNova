# SuperNova 2.0 快速上手指南 (Quick Start)

歡迎使用 SuperNova 2.0。這是一份為開發者（與 AI 協作者）準備的極簡索引。

---

## 🏗️ 核心架構：EMR 模式
本專案採用 **「Entity-Manager-Repository」** 三層架構實現模組化與插拔能力：

1.  **Entity (實體 - `src/models/`)**：包含業務邏輯與狀態的對象。
2.  **Manager (管理者 - `src/manager/`)**：控制實體的生命週期、內存緩存與業務調度。
3.  **Repository (儲存庫 - `src/infra/storage/`)**：負責數據的持久化 (IO)。

---

## 📂 目錄結構導覽

### 核心邏輯
-   `src/runtime/`：系統啟動入口 (`GlobalRuntime`)。
-   `src/manager/`：四大控制器 (User, Session, Task, Agent)。
-   `src/models/`：業務領域模型。
-   `src/task/`：高階執行與規劃邏輯 (`TaskPlanner`)。

### 基礎設施
-   `src/infra/types/`：**系統憲法**。定義所有 DTO 與介面 (解耦關鍵)。
-   `src/infra/storage/`：持久化實作 (目前為 FileSystem)。
-   `src/infra/`：通訊總線 (`EventBus`) 與日誌系統 (`LogManager`)。

### 其他
-   `agents/`：Agent 身份與提示詞配置檔案。
-   `workspace/`：運行時生成的數據、日誌與任務狀態。
-   `tests/`：包含單元測試與端到端整合測試。

---

## 🚀 系統啟動流程
1.  **加載配置**：`GlobalRuntime.start()` 讀取 `supernova.json`。
2.  **初始化 Repository**：根據配置注入具體的持久化實作。
3.  **啟動 Manager**：實例化控制器並註冊至 `GlobalRegistry`。
4.  **載入 Agent**：`AgentManager` 從儲存庫載入所有代理配置。
5.  **就緒**：系統進入事件監聽狀態。

---

## 💡 開發備忘
-   **新增功能**：先在 `src/infra/types/` 定義協議。
-   **更換儲存**：在 `src/infra/storage/` 實作介面，於 `GlobalRuntime` 切換注入。
-   **詳細架構**：請參閱 `docs/ARCH.md` 與 `docs/DEVELOPMENT_ROADMAP.md`。
