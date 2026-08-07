---
title: Web UI 與 WebSocket 伺服器整合架構
version: 0.1.0
status: APPROVED
last_updated: 2026-08-07
related_codes:
  - ../../src/package/server/
  - ../../web/
related_docs:
  - ../ARCH.md
---

# Web UI 與 WebSocket 伺服器整合架構

本文件定義了 SuperNova 核心引擎 (Agent Runtime) 如何透過六角形架構 (Hexagonal Architecture) 向外延伸出 WebSocket Server，並與獨立的 React/Vite 前端應用程式進行非同步事件的雙向通訊。

## 1. 系統定位與邊界 (System Boundaries)

SuperNova 的 `src/core/` 定位為純粹的 **Agent Runtime (底層引擎)**，負責記憶管理、LLM 推理、工具沙盒與 EventBus。引擎本身對外部通訊協議 (HTTP/WebSocket) 保持無知 (Agnostic)。

為了解決這點，我們在 `src/package/server/` 實作了「轉接器層 (Adapter Layer)」：
- 依賴 `src/core/index.ts` 匯出的介面。
- 啟動並封裝 Bun 原生的 WebSocket 伺服器。
- 負責將使用者的網路輸入轉譯為 `processInbox`，並將核心引擎拋出的 `AgentMessage` 與 `AgentThinking` 事件透過 WebSocket 轉發至 Web UI。

## 2. 後端伺服器設計 (`src/package/server/`)

### 2.1 Server 進入點
- **檔案位置**: `src/package/server/index.ts` (或類似名稱)
- **職責**: 初始化 `RuntimeKernel`、掛載核心設定，並啟動 Bun HTTP/WebSocket Server。

### 2.2 WebSocket 路由設計
- **端點**: `/ws/session/:sessionId`
- **連線生命週期**:
  1. **OnOpen**: 前端連線後，驗證 Session ID，若 Session 尚未載入則透過 `SessionManager` 啟動。
  2. **OnMessage**: 接收前端傳來的 Payload (如：使用者對話文字)。
  3. **OnClose**: 清理連線資源，但保留 Agent 的背景執行狀態。

### 2.3 EventBus 事件轉發橋樑
為了讓 Web UI 實現打字機效果與狀態監控，Server 必須訂閱全局 `EventBus`，過濾出屬於該 `sessionId` 的事件，再推播至對應的 WebSocket Socket：
- 轉發 `AgentEvent.AgentMessage` -> 用於呈現對話氣泡與 Markdown 渲染。
- 轉發 `AgentEvent.AgentThinking` -> 用於呈現「Agent 思考中」面板。

## 3. 前端 Web UI 設計 (`web/`)

前端專案採用已有的 TailAdmin React 範本，結合 Vite、Tailwind CSS 與 React Router 打造現代化儀表板。

### 3.1 專案結構
- 獨立的 `web/` 資料夾，具備自己的 `package.json` 與建置腳本。

### 3.2 核心 Hook (`useAgentSocket`)
建立自訂 Hook 處理通訊：
- 管理與 Bun 伺服器的 WebSocket 連線 (斷線重連機制)。
- 維護一組 Local State（如 `messages`, `thoughts`, `agentState`）。
- 當收到伺服器推播時，即時更新 React State 觸發畫面重繪。

### 3.3 重點功能頁面 (UI Features)
1. **主控台對話區 (`/chat` or `Home`)**: 
   - 包含對話歷史串 (Chat Thread)，支援 Markdown 渲染 (react-markdown)。
   - 輸入框支援多行文字與送出快捷鍵。
2. **大腦監視面板 (Brain Monitor Panel)**:
   - 位於右側或獨立視窗，即時顯示 `AgentThinking` 內容。
   - 未來可擴充顯示動態檢索到的圖譜記憶 (Graph Memory Context) 與 Token 消耗。

## 4. 啟動與開發工作流 (Dev Workflow)

未來的開發必須平行啟動兩端：
1. **後端 (API/WS)**: `bun run src/package/server/index.ts`
2. **前端 (Vite)**: `cd web && npm run dev`
