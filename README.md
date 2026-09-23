# SuperNova

[English](README_en.md) | [繁體中文](README.md)

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Composable_Organs-orange.svg)](docs/ARCH.md)
[![Stage](https://img.shields.io/badge/Stage-v2.1.0--dev-green.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

SuperNova 是一套專注於高效能、高擴展性、狀態隔離與長期認知演進的 **自主多代理人執行架構 (Autonomous Multi-Agent Runtime)**。系統運行於 [Bun](https://bun.sh/) 之上，採用事件驅動架構、通用 Agent 容器與高度模組化設計，賦予 Agent 在複雜長程任務中維持極度穩定的認知、記憶與多代理協同能力。

> **專案前身**: [Proj.Nova](https://github.com/yan-930521/Proj.Nova/)

> [!WARNING]
> **安全性警告**：部分工具（如 `RunBashTool`）尚未實作沙盒隔離。請僅在隔離的 VM 或 Docker 容器內執行本系統，切勿部署於含機密資料的生產環境。

---

## Quick Start

**環境需求**：[Bun](https://bun.sh/) >= 1.3.14 · [Git](https://git-scm.com/) >= 2.x · OpenAI API Key

```bash
# 1. 安裝依賴
bun install

# 2. 配置環境變數
cp .env.template .env
# 編輯 .env 填入你的 OPENAI_API_KEY

# 3. 執行主展示程序 (真實 LLM 推理)
bun run demo

# 4. 型別檢查與單元測試
bun x tsc --noEmit
bun test
```

> 系統配置請參閱根目錄的 `config.yaml`。更多 Demo 腳本（任務系統、記憶系統、效能壓測）請參閱 `package.json` 中的 scripts。

---

## 核心特色 (Core Features)

### 多代理人協作系統
- **通用代理純容器 (Universal Agent)**：以極簡宿主容器（<400 行代碼）取代階層繼承樹，所有認知與業務能力皆為可熱插拔的器官模組 (`IAgentModule`)，依據任務需求自由組裝特化角色。
- **任務 DAG 引擎 (`TaskDAG` & `PlannerModule`) `[重構中]`**：基於 LATS (Language Agent Tree Search) 蒙地卡羅樹狀搜尋與有向無環圖的自動化任務排程、依賴解鎖與自我反思。
- **細粒度工具與動態權限 (`SupervisorModule`) `[重構中]`**：依據代理人角色動態分配工具集，高風險操作需經監督器官動態授權審核。

### 記憶與上下文管理
- **滑動視窗壓縮**：歷史對話壓縮與卸載，搭配 Payload Offloading 防止 Token 爆量與 OOM。
- **圖向量混合記憶 (`MemoryModule`)**：基於 BaseJsonRepository 與 Vectra 本地向量庫，自動背景提煉知識三元組與語意 Embeddings，思考前執行子圖檢索注入，並提供 `recall_memory` 深度回想工具。

### 自進化技能生態 (CodeSkill)
- **CodeSkill 自我修復閉環 `[重構中]`**：Agent 可在執行期動態撰寫 TypeScript 技能，具備版本控制、成功率追蹤與自動退版能力，形成「創造-測試-除錯-修復」的自我演進閉環。
- **泛型化外部環境 SDK `[重構中]`**：泛型環境抽象層，可無縫適配 Minecraft、Line Bot、爬蟲等任意外部領域。
- **Novalink 雙向通訊 `[重構中]`**：基於 WebSocket JSON-RPC 2.0 的雙向通訊架構，提供低延遲通訊並將物理運算卸載至後端伺服器。

### 工程基礎設施
- **微內核架構與合一生命週期 (`@supernova/runtime`)**：提供五階段狀態機流轉、服務依賴注入池與嚴格的逆序優雅停機 (Reverse Order Shutdown) 保障。
- **強型別事件總線 (`@supernova/events`)**：全非同步 EventBus 架構，支援泛型推導與步驟前後 Hook 鏈路，Agent 呼叫工具後掛起、完成後喚醒，全程無阻塞。
- **工作區隔離沙盒 (Workspace Isolation) `[重構中]`**：每個 Session 獨立環境沙盒，操作可追溯、可回滾。

---

## 系統架構文檔導覽

完整的 C4 階層架構規格文件已歸檔於 `docs/` 目錄：

- **全局架構與哲學**：[系統架構藍圖 (ARCH.md)](docs/ARCH.md) · [架構哲學與核心設計模式 (Overview)](docs/architecture/overview.md)
- **代理人核心與器官**：[通用代理容器 (Universal Agent)](docs/architecture/agent/universal_agent.md) · [器官介面規格 (Module Interface)](docs/architecture/agent/module_interface.md) · [提示詞組裝引擎 (Prompt Engine)](docs/architecture/agent/prompt_engine.md) · [標準器官模組清單 (Modules)](docs/architecture/modules/)
- **通訊與會話子系統**：[會話實體 (Session)](docs/architecture/messaging/session.md) · [會話管理器 (Session Manager)](docs/architecture/messaging/session_manager.md) · [訊息路由器 (Message Router)](docs/architecture/messaging/message_router.md) · [資料區塊與大資料卸載 (DataBlock)](docs/architecture/messaging/datablock.md)
- **任務編排子系統**：[任務拓撲圖 (TaskDAG)](docs/architecture/task/task_dag.md) · [任務調度器 (Task Dispatcher)](docs/architecture/task/task_dispatcher.md)
- **微內核基礎設施**：[微內核架構 (Micro-Kernel)](docs/architecture/kernel/micro_kernel.md) · [強型別事件總線 (EventBus)](docs/architecture/kernel/event_bus.md) · [配置中心 (Config System)](docs/architecture/kernel/config_system.md) · [多模型預設工廠 (LLM Provider)](docs/architecture/kernel/llm_provider.md)
- **持久化與儲存設施**：[儲存庫模式抽象 (Repository Pattern)](docs/architecture/storage/repository_pattern.md) · [檔案系統持久化規範 (File System Storage)](docs/architecture/storage/file_system_storage.md)
- **API 規格與契約**：[全域標準事件目錄 (Event Catalogue)](docs/api/event_catalogue.md) · [模組開發契約指南 (Module Contract)](docs/api/module_contract.md)

> 專案報告與進階閱讀：[效能基準報告 (BENCHMARK.md)](demo/benchmark/BENCHMARK.md) · [專案開發藍圖 (ROADMAP.md)](ROADMAP.md) · [更新日誌 (CHANGELOG.md)](CHANGELOG.md)

---

## Contributing

歡迎貢獻！請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md) 了解開發規範與提交流程。

## License

本專案採用 [Apache License 2.0](LICENSE) 授權。

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.