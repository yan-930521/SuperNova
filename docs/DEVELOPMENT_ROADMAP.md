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
**狀態：進行中 🏗️**

### 核心目標
將推理邏輯與特定框架 (如 LangChain) 解耦，實現「模型即插件」。

### 實施重點
- **介面定義**：實作 `IInferenceAdapter<T>` 泛型介面。
- **抽象上下文**：實現 `infer(state: AgentState)`，由適配器負責 Prompt 構造，Agent 僅需傳遞當前狀態。
- **結構化輸出**：強制要求綁定 Zod Schema，確保模型回傳強型別對象。
- **多供應商支持**：提供 `LangChainAdapter` (用於過渡) 與原生 API 適配器。

---

## 🚀 階段三：任務動力層 (JIT Task System)
**狀態：待啟動 📅**

### 核心目標
從「預先全盤規劃」轉向「即時反饋規劃」，解決任務重複與僵化的病灶。

### 實施重點
- **即時規劃 (Just-in-Time)**：TaskPlanner 僅規劃當前里程碑。
- **反饋驅動**：根據上一個任務的執行結果（Result + Summary）動態修正後續任務圖。
- **自癒能力**：TaskManager 具備處理任務失敗後的局部重規劃（Re-plan）能力。
- **並行優化**：利用 `TaskGraph` 的入度算法，實現更穩健的並行執行調度。

---

## 📅 維護紀錄
- **2026-05-26**：正式確立三階段路線圖，並完成階段一與 1.5 介面對齊。
