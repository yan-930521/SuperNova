# SuperNova

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#architecture-highlights)
[![Stage](https://img.shields.io/badge/Stage-v0.1.0-green.svg)](#development-roadmap)

SuperNova 是一個 **Embodied AI Runtime** -- 一套賦予 AI Agent 具身認知、情緒模型與長期自主能力的執行時引擎。它運行於 Bun 高性能環境之上，透過「雙腦分層架構」將高階決策與領域執行徹底隔離，同時讓 Agent 能夠感知情緒並操控物理世界。系統以事件驅動與完全非同步的設計從根本上消除 Context Drift (上下文漂移) 與 Goal Drift (目標偏移)，使 Agent 能在複雜、跨領域的長期任務中保持穩定的認知與一致的目標。

> **快速掌握架構**: 請優先閱讀 [docs/ARCH.md](docs/ARCH.md) 以獲取最新的系統設計藍圖。
>
> **專案前身**: [Proj.Nova](https://github.com/yan-930521/Proj.Nova/)

---

## Architecture Highlights

### Dual-Brain Architecture -- 雙腦分層架構

系統將 Agent 的認知劃分為「決策層」與「執行層」，徹底隔離高階決策與領域運算：

- **MainAgent (決策中樞)** -- 系統的最高決策節點。不執行任何工具調用，純粹負責情緒演算、高階決策與人類自然對話。MainAgent 將 EmbodiedAgent 視為自己在物理世界中的操作端，並能透過上下文投影 (Context Projection) 直接接管。
- **TaskAgent (任務執行核心)** -- 專注的任務執行單元。在獨立的 Git Worktree 隔離沙盒中運算，確保決策中樞的上下文不被龐大的程式碼細節淹沒。支援無狀態併發分身 (Auto-Concurrency)。
- **EmbodiedAgent (具身感知)** -- 決策中樞在物理世界中的執行端與感測端。將底層環境操作具象化為 CLI 指令，執行層只需下達意圖指令 (Intent Command)，達到「決策與操作」的完美解耦。

### OCC Emotion Engine -- 情緒認知引擎

Agent 不只是冰冷的推理機器。MainAgent 內建基於 OCC 理論的多維情緒狀態模型：

- 維護能量 (Energy)、親密度 (Intimacy)、喜悅、焦慮、驕傲、壓力、社交需求等獨立維度
- 情緒隨時間自然衰減，並受外界事件 (如任務成功、衝突、長時間沉默) 即時衝擊
- 杏仁核劫持機制 (Amygdala Hijack) -- 外部環境的劇烈變化能繞過理性層直接觸發情緒波動
- 情緒狀態影響決策風格與對話語氣，使 Agent 具備真正的「人格連續性」

### Embodied Intelligence -- 具身智能框架

SuperNova 的 Agent 不僅存在於文字空間，更能棲息於物理或虛擬的 3D 世界中：

- **Physical World First 原則** -- 外部軀殼實體連線且就緒後，系統才開始介入調度
- **感知-決策-行動迴路** -- EmbodiedAgent 持續接收環境狀態 (WorldUpdated 事件)，經決策層處理後透過 CLI 工具執行物理操作
- **上下文投影 (Context Projection)** -- MainAgent 可隨時接管 EmbodiedAgent 的操作權，合併歷史記憶與工具集，實現跨 Agent 的上下文共享與直接操控
- **Minecraft 沙盒驗證** -- 以 mineflayer 為實驗場，完整驗證採集、戰鬥、跟隨等具身行為的自主決策鏈

### Async Event-Driven Fabric -- 非同步事件驅動織網

全面捨棄同步等待，以 EventBus 為通訊骨幹串連所有組件：

- Agent 透過 `send_message` 發佈任務後即主動掛起休眠，由事件流自動喚醒
- 會話租戶隔離 (sessionId) -- 事件天然按 Session 分區，杜絕跨會話資料洩漏
- 異步 Promise 安全邊界 -- 阻斷單一 reject 引發的連鎖崩潰
- 殭屍監聽器自動清理 -- Agent 銷毀時統一解綁所有事件訂閱，杜絕記憶體洩漏

### Temporal Context Injection -- 時間感知插針

Agent 具備時間流逝的感知能力。系統在組裝歷史紀錄時，動態偵測相鄰訊息的時間間隔，若超過閾值 (預設 30 分鐘) 則自動安插虛擬的時間標記 (如「距離上次對話已過 2 小時」)。此機制完全不污染底層資料庫，僅在投影給 LLM 的瞬間生效。

### Dehydrate / Rehydrate -- 狀態脫水與喚醒

Agent 並非永駐記憶體。閒置時其完整狀態 (包含情緒、Profile、Token 消耗紀錄) 會被序列化寫入磁碟並銷毀實體；需要時從持久化層還原，實現高並發下的彈性擴縮與容錯。

### Performance-First Memory Pipeline -- 極致效能記憶管線

- **增量式歷史快取** -- DataBlock 的 LangChain Message 轉換結果被 Memoize，消除 95% 以上的重複序列化
- **LRU 快取驅逐** -- 檔案倉儲層以上限 50 Key 的 LRU 演算法防止記憶體無限增長
- **延遲壓縮標記** -- 已壓縮的 DataBlock 被標記跳過，歷史掃描從 O(N) 降至 O(1)
- **異步日誌寫入** -- FileTransport 以背景緩衝佇列取代同步阻塞，釋放 Event Loop 吞吐
- **批次訊息管線化 (Batch Pipelining)** -- 支援陣列訊息廣播，統一去重寫入與派發，避免重複喚醒 (Wakeup)
- **透明化 ReAct 迴圈** -- 完整攔截與紀錄 LLM 中間的每一次思維鏈 (`<thought>`) 與工具呼叫，杜絕推論黑箱

### Repository Pattern and Git-Native Workspace -- 倉儲模式與原生 Git 工作區

- 儲存層透過 `ISessionRepository`、`IDataBlockRepository`、`IAgentStateRepository` 徹底與業務解耦
- 每個 Session 擁有獨立的 Git 倉庫，Agent 在專屬的 Worktree 分支中運算，物理隔離且支援回滾
- 歷史紀錄採用 JSONL 格式，支援 O(1) 追加寫入
- Claim Check Pattern -- 超大 Payload 自動卸載至 Blob 檔案，以 DataPointer 引用，防止 Token 溢位

### Zero-Trust Security Boundary -- 零信任安全邊界

- 人工審批閘道 (HITL) -- 高危操作強制等待人類確認
- Prompt 注入防禦 -- 系統級安全過濾
- 安全熔斷器 (Circuit Breaker) -- 連續錯誤超過深度閾值時強制切斷 Agent 的執行迴圈

---

## Project Structure

```
src/
  core/                        # 核心引擎與基礎設施
    agent/                     # Agent 實體與工具系統
      BaseAgent.ts             # 抽象基底 -- 生命週期、狀態機、情緒載體
      MainAgent.ts             # 決策中樞 -- 情緒模型與高階決策
      TaskAgent.ts             # 任務執行核心 -- 隔離運算與併發分身
      EmbodiedAgent.ts         # 具身感知 -- 物理世界介面
      AgentManager.ts          # 統籌管理 -- 脫水/喚醒與活躍池
      tool/                    # BaseTool、AgentTools、WorkspaceTools
    messaging/                 # 事件驅動通訊層
      EventBus.ts              # 非同步事件匯流排 (會話隔離)
      DataBlock.ts             # 資料載體與增量快取
      IBus.ts                  # 匯流排介面與事件分類定義
    session/                   # 會話與狀態管理
      SessionManager.ts        # 全局訊息派發與排程
      Session.ts               # 會話實體與 InboxBuffer
    lifecycle/                 # 運行時內核
      RuntimeKernel.ts         # 系統啟動與依賴注入中樞
    container/                 # DI 容器
    config/                    # 配置管理與預設值
    infra/                     # 基礎建設
      persistence/             # Repository 實作與 StorageDriver
      transports/              # 日誌傳輸 (Console / File)
    utils/                     # PromptLoader、IdGenerator 等工具
  package/                     # 業務擴充與外掛層 (如 Minecraft 對接)
docs/                          # 架構設計文件
prompts/                       # Agent Profile JSON 與 Prompt 範本
```

**依賴規則**: `src/package/` 只能透過 `src/core/index.ts` 引用核心功能，核心層嚴禁反向引用業務層。

---

## Why Bun?

| 考量 | 選擇理由 |
|------|---------|
| 啟動與執行效率 | Bun 的冷啟動速度與運行時效能遠超傳統 Node.js，適合 Agent 高頻長時運行 |
| 原生 TypeScript | 無需額外編譯步驟，直接執行 `.ts` 檔案 |
| 測試框架 | 內建高效的 `bun test` 運行器 |
| 依賴管理 | 極速的套件安裝與精簡的鎖定檔機制 |

---

## Quick Start

```bash
# 安裝依賴
bun install

# 執行主程式 Demo
bun run demo

# 執行 Minecraft 具身智能沙盒
bun run demo:minecraft

# 型別檢查
bun run lint

# 執行併發測試
bun test:batch
```

---

(c) 2026 SuperNova Project. An experiment in embodied cognition, emotional agency, and autonomous coordination.
