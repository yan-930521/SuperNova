---
title: 工具系統設計 (Tool System)
version: 0.1.0
status: APPROVED
last_updated: 2026-08-06
related_codes: 
  - src/core/agent/tool/BaseTool.ts
  - src/core/agent/tool/AgentTools.ts
  - src/core/agent/tool/WorkspaceTools.ts
related_docs:
  - ../../ARCH.md
  - ./agent.md
---

# 工具系統設計 (Tool System Design)

本系統為了讓 Agent (特別是 `TaskAgent` 與 `EmbodiedAgent`) 具備與環境互動及執行具體操作的能力，引入了強型別的工具系統。我們採用與 LLM 框架 (如 LangChain) 適度解耦的設計，確保核心業務邏輯的獨立性。

## 1. 核心抽象類別 (BaseTool)

所有的工具都必須繼承自 `BaseTool`。它承載了以下設計原則：

*   **強型別參數驗證 (Zod Schema)**：
    每個工具必須透過 `zod` 定義其參數結構 (`schema`)。這不僅讓 TypeScript 具備完整的型別推導能力，也能在執行期防堵 LLM 生成的無效或惡意參數，避免執行時崩潰。
*   **上下文傳遞 (ToolContext)**：
    工具的執行方法 `execute(args, context)` 強制要求傳入 `ToolContext`。
    `ToolContext` 包含 `sessionId`、`agentId`，以及為了能讓 Agent 發送事件而注入的 `eventBus` (型別為 `IEventBus`)。這提供工具所需的基礎會話資訊與事件發布能力。
*   **LLM 框架解耦 (Adapter Pattern)**：
    `BaseTool` 本身是領域層的實體，完全不依賴特定 LLM 提供商。但它內建了 `toLangChainTool()` 轉譯方法，可以將自身動態打包為 `@langchain/core/tools` 相容的 `DynamicStructuredTool`。若未來更換框架，僅需修改此橋接方法。

## 2. 工具掛載與無狀態化 (Stateless Tools & Registry)

系統採用全域註冊表與無狀態工具設計：

*   **無狀態化 (Stateless)**：工具實體本身不保存 `sessionId` 或 `agentId`。執行時的環境與會話資訊完全由 `ToolContext` 傳入。
*   **全域工具註冊表 (ToolRegistry)**：
    *   系統啟動時，會實例化單一的 `ToolRegistry` 並註冊所有可用的 `BaseTool`（包含工作區與代理人工具）。
    *   Agent 透過 `allowedTools` 字串陣列向 `ToolRegistry` 請求所需的工具實例參考。這使得工具的分配具備極高的動態性與可配置性。

## 3. 執行資料流 (Data Flow)

1.  **綁定 (Binding)**：Agent 將其持有的 `BaseTool[]` 轉譯為 LLM 原生格式並綁定 (Bind) 到 Prompt 中。
2.  **呼叫 (Invocation)**：LLM 決定呼叫特定工具，回傳 Function Calling 要求。
3.  **驗證與執行 (Validation & Execution)**：底層執行器先透過 `BaseTool.schema.parse()` 進行嚴格驗證，驗證通過後，將參數與 `ToolContext` 傳入 `BaseTool.execute()` 執行實體邏輯。`BaseTool` 的職責僅專注於執行邏輯並回傳原始資料字串，若發生錯誤則捕捉並回傳錯誤訊息。
4.  **紀錄與廣播 (Record & Broadcast)**：實際的 `TOOL_CALL` / `TOOL_RESULT` `DataBlock` 紀錄與事件廣播是由 `BaseAgent.callModel` 負責處理。此設計達成了清晰的職責分離：「工具負責做事，大腦負責記憶與廣播 (tools do work, brains remember and broadcast)」。

## 4. 內建工具列表 (Built-in Tools)

目前系統已實作並支援以下幾種主要工具：

### 代理人通訊與控制工具 (AgentTools)
*   **`SendMessageTool`**：允許 Agent 傳送訊息 (`AGENT_REPLY`) 給系統中的其他 Agent，可用於聊天、下達指令或委派任務。
*   **`ToggleProjectionTool`**：啟動或切換意識投影狀態，取得目標 Agent (軀殼) 的直接控制權或解除控制。`MainAgent` 預設會掛載此工具。

### 工作空間工具 (WorkspaceTools)
*   **`ReadFileTool`**：讀取工作空間內的檔案內容。
*   **`WriteFileTool`**：寫入內容至工作空間內的檔案。
*   **`ListFilesTool`**：列出工作空間指定目錄下的檔案清單。
*   **`RunBashTool`**：執行 Bash 系統指令。
*   **`ReadBlobTool`**：讀取系統壓縮的大型資料指標 (例如 `<Pointer: blob_xxx>`)，僅在對話紀錄出現指標時呼叫。

> 進階功能規劃（沙盒隔離、工具權限、重試機制、環境動作工具）請參閱 [Tool 進階功能規劃](../../todo/tool_advanced.md)。
