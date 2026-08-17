# SuperNova

[English](README_en.md) | [繁體中文](README.md)

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#核心特色)
[![Stage](https://img.shields.io/badge/Stage-v0.2.2-green.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

SuperNova 是一個專注於效能與狀態管理的 **Agent Runtime (代理人執行引擎)**。它運行於 Bun 之上，透過事件驅動架構解決長效型 AI 系統常見的上下文爆炸與目標飄移問題，使 Agent 能在複雜的長期任務中保持穩定的認知與執行力。

> **專案前身**: [Proj.Nova](https://github.com/yan-930521/Proj.Nova/)

> [!WARNING]
> **安全性警告**：部分工具（如 `RunBashTool`）尚未實作沙盒隔離。請僅在隔離的 VM 或 Docker 容器內執行本系統，切勿部署於含機密資料的生產環境。

---

## Quick Start

**環境需求**：[Bun](https://bun.sh/) >= 1.3.14 · [Git](https://git-scm.com/) >= 2.x · OpenAI API Key · Tavily API Key

```bash
# 安裝依賴
bun install

# 配置環境變數
cp .env.template .env
# 編輯 .env 填入你的 OpenAI API Key 與 Tavily API Key

# 執行主程式
bun run demo

# 型別檢查與測試
bun run lint
bun test
```

> 系統配置請參閱根目錄的 `config.yaml`。更多 Demo 腳本（任務系統、記憶系統、效能壓測）請參閱 `package.json` 中的 scripts。

---

## 核心特色

### 多代理人協作系統
- **多腦架構**：`MainAgent`（決策與排程）、`TaskAgent`（專注任務流執行）、`EmbodiedAgent`（環境感知與操作），職責分離避免 Prompt 污染。
- **動態上下文投影**：主腦可無縫接管子代理人的歷史與工具集，親自下場完成高難度任務。
- **任務 DAG 引擎**：基於 LATS (Language Agent Tree Search) 策略搜尋與有向無環圖的自動化任務排程與依賴解鎖。（參閱規劃引擎輸出範例：[全局大綱 Holistic](demo/lats_holistic.txt) 與 [逐步推演 Step-by-step](demo/lats_step_by_step.txt)）
- **細粒度工具權限**：依據代理人角色動態分配工具集，嚴格劃分權限邊界。

### 記憶與上下文管理
- **圖向量混合記憶**：長期記憶自動提煉實體與關係圖譜，情節記憶於閒置時濃縮為 AI 日記，思考前自動注入相關上下文。
- **滑動視窗壓縮**：歷史對話自動壓縮與卸載，搭配 Payload Offloading 防止 Token 爆量與 OOM。
- **狀態持久化**：閒置 Agent 自動序列化至磁碟 (Dehydrate)，需要時即時還原 (Rehydrate)。

### 自進化技能生態 (CodeSkill)
- Agent 可在執行期動態撰寫 TypeScript 技能，具備版本控制、成功率追蹤與自動退版能力，形成「創造-測試-除錯-修復」的自我修復閉環。
- 泛型化環境 SDK，可無縫適配 Minecraft、Line Bot、爬蟲等任意外部領域。

### 工程基礎設施
- **事件驅動**：全非同步 EventBus 架構，Agent 呼叫工具後掛起、完成後喚醒，全程無阻塞。
- **Clean Architecture**：`domain` / `infra` / `tools` / `prompts` 四層解耦，搭配 IoC 容器與 Zod 強型別配置引擎。
- **Git Worktree 隔離**：每個 Session 獨立分支，操作可追溯、可回滾。

> 深入了解：[架構藍圖 (ARCH.md)](docs/ARCH.md) · [效能報告 (BENCHMARK.md)](demo/benchmark/BENCHMARK.md) · [開發藍圖 (ROADMAP.md)](ROADMAP.md) · [更新日誌 (CHANGELOG.md)](CHANGELOG.md)

---

## Contributing

歡迎貢獻！請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md) 了解開發規範與提交流程。

## License

本專案採用 [Apache License 2.0](LICENSE) 授權。

---

(c) 2026 SuperNova Project. An experiment in building high-performance agentic systems.
