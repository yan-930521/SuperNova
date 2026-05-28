# SuperNova 2.0 開發路線圖 (Development Roadmap)

本文件定義了 SuperNova 從「業餘原型」進化為「工業級 AI 運行時」的三個核心開發階段。

---

## 🏁 階段一：基礎建設與身份系統 (Infrastructure & Identity)
**狀態：已完工 ✅ (2026-05-26)**

### 核心目標
建立系統的標準地基，實現「狀態分離與職責解耦」。

### 實施重點
- **DTO 規格化**：定義了 User, Session, Task, Agent 的標準數據協議。
- **Manager/Repository 對稱架構**：
    - `Repository`：專注於持久化 IO (目前實作：FileSystem)。
    - `Manager`：專注於活躍實體的生命週期管理與緩存。
- **依賴解耦**：建立 `GlobalRegistry` 作為中央服務訪問點。
- **強型別事件總線**：實現了基於 `SystemEventType` 的 `IEventBus`。

---

## 🏗️ 階段二：智能適配層 (Inference Adapter)
**狀態：暫緩 (Paused) ⏸️**

### 核心目標
將推理邏輯與特定框架 (如 LangChain) 解耦，實現「模型即插件」。

### 實施重點
- **介面定義**：實作 `IInferenceAdapter<T>` 泛型介面。
- **多供應商支持**：提供 `LangChainAdapter` (用於過渡) 與原生 API 適配器。
- **結構化輸出優化**：進一步強化與 Zod Schema 的綁定，支持更複雜的聯合型別。

> **註記**：由於 `InferenceEngine` 已在 `ModelRegistry` 中實現了核心結構化輸出功能，足以支撐目前開發需求，故將資源優先投入「階段三」。

---

## 🚀 階段三：任務動力層 (JIT Task System)
**狀態：部分完成 (Partial Implementation) 🏗️**

### 核心目標
從「預先全盤規劃」轉向「即時反饋規劃」，解決任務重複與僵化的病灶，實現真正的動態自癒。

### 實施重點
- [x] **即時規劃 (Just-in-Time)**：實作按里程碑動態展開任務圖。
- [x] **脈搏與監聽 (Pulse & Watchers)**：實作 Task 心跳機制與超時偵測。
- [x] **JIT 自癒與重規劃 (Self-Healing)**：實作了 3x3 階梯式重試機制、認知重規劃 (Cognitive Re-planning) 以及任務上下文隔離與繼承 (Context Isolation)。
- [ ] **STUCK 狀態處理**：設計當任務鏈進入 STUCK 狀態時的後續處置機制（如人類介入 HITL 或自動降級）。
- [ ] **記憶系統 (Memory System)**：建立短、中、長期記憶層級，支援基於向量檢索與語境壓縮的 Context 管理。
- [x] **環境適配**：完成從 Node.js 到 Bun 的環境遷移 (2026-05-28)。

---

## ☁️ 階段四：生產化與雲端原生 (Production & Cloud-Native)
**狀態：規劃中 📅**

### 核心目標
將系統從本地文件環境遷移至工業級基礎設施，實現高可用與可伸縮性。

### 實施重點
- **多層次儲存遷移**：
    - **PostgreSQL**：管理 User, Session, Task 的強型別關係數據。
    - **MongoDB**：儲存非結構化的對話歷史與詳細的工具執行快照 (OpLog)。
    - **Redis**：實現分散式鎖 (Resource Locking) 與任務脈搏的即時狀態同步。
- **容器化部署 (Docker)**：提供標準化的 Docker 鏡像與 Compose 配置，支援雲端一鍵部署。
- **權限與多租戶 (RBAC)**：實作嚴格的代理權限與用戶隔離模型。

---

## 🎨 階段五：專屬代理與視覺化控制 (Specialized Agents & UI)
**狀態：長遠展望 🔮**

### 核心目標
實現代理的「自動化生成」與「全局視覺化監控」。

### 實施重點
- **目標驅動的代理工廠 (Agent Factory)**：根據特定的長期目標 (Long-term Goal)，自動生成具備專屬身份、能力與監控策略的 Agent。
- **SuperNova Web UI**：
    - **任務導航牆**：直觀展示 TaskGraph 的 DAG 流轉與實時狀態。
    - **代理監控面板**：觀測 Agent 的心跳、Token 消耗與健康度。
    - **人類介入終點 (HITL)**：透過介面點擊批准高危操作。
- **自進化系統 (Self-Evolving)**：賦予代理修改系統規則與自我優化的能力。
- **TailAgent (./web)**：基於現代 Web 技術 (如 Tailwind + React) 打造的終端代理介面，提供優美的即時狀態流動與互動式控制。

---

## 📅 維護紀錄
- **2026-05-26**：正式確立三階段路線圖，並完成階段一與 1.5 介面對齊。
- **2026-05-28**：遷移至 Bun 環境，並新增 Memory System 與 TailAgent 計畫。

## 想法記錄
- **2026-05-29**：https://blog.can.ac/2026/02/12/the-harness-problem/ 增強文本編輯tool