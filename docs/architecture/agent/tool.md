---
title: 工具系統設計 (Tool System)
version: 0.1.0
status: APPROVED
last_updated: 2026-07-20
author: Antigravity & User
related_codes: 
  - src/core/agent/tool/BaseTool.ts
related_docs:
  - ../../ARCH.md
  - ./agent.md
---

# 工具系統設計 (Tool System Design)

本系統為了讓 Agent (特別是 `SubAgent` 與 `EmbodiedAgent`) 具備與環境互動及執行具體操作的能力，引入了強型別與沙盒隔離的工具系統。我們採用與 LLM 框架 (如 LangChain) 適度解耦的設計，確保核心業務邏輯的獨立性。

## 1. 核心抽象類別 (BaseTool)

所有的工具都必須繼承自 `BaseTool`。它承載了以下設計原則：

*   **強型別參數驗證 (Zod Schema)**：
    每個工具必須透過 `zod` 定義其參數結構 (`schema`)。這不僅讓 TypeScript 具備完整的型別推導能力，也能在執行期防堵 LLM 生成的無效或惡意參數，避免執行時崩潰。
*   **沙盒與上下文隔離 (ToolContext)**：
    工具的執行方法 `execute(args, context)` 強制要求傳入 `ToolContext`。
    `ToolContext` 包含 `sessionId`、`agentId`、`workspacePath`，以及為了能讓 Agent 發送事件而注入的 `eventBus` (型別為 `IEventBus`)。這確保了檔案讀寫或環境操作被限制在該 Agent 專屬的目錄沙盒內，實踐「零信任安全架構」，並允許 Tool 將執行軌跡拋回事件系統。
*   **LLM 框架解耦 (Adapter Pattern)**：
    `BaseTool` 本身是領域層的實體，完全不依賴特定 LLM 提供商。但它內建了 `toLangChainTool()` 轉譯方法，可以將自身動態打包為 `@langchain/core/tools` 相容的 `DynamicStructuredTool`。若未來更換框架，僅需修改此橋接方法。

## 2. 工具類型與掛載場景 (Capability Provider Pattern)

系統採用 **Capability Provider (能力提供者)** 設計模式。Agent 本身預設不帶任何環境互動工具，而是向其所處的環境 (如 `WorkspaceManager` 或 `MinecraftEnv`) 請求可用工具。

### A. 檔案與系統操作工具 (由 `WorkspaceManager` 提供)
*   **包含**：`ReadFileTool`、`WriteFileTool`、`ListFilesTool`、`RunBashTool`。
*   **掛載機制**：`WorkspaceManager` 提供 `loadTools(sessionId, agentId)` 介面。根據該 Agent 的權限 (例如是否唯讀)，動態實例化並回傳對應的 `BaseTool[]`。
*   **優勢**：工具內部實作直接呼叫 `WorkspaceManager` 的私有或受保護方法，並透過閉包 (Closure) 綁定 `sessionId` 與 `agentId`，Agent 執行時完全不需要處理路徑安全或沙盒邏輯。

### B. 環境動作工具 (ActionTools, 由 `EmbodiedEnv` 提供)
*   **包含**：例如 Minecraft 中的 `walk_to_target`、`mine_block` 等。
*   **掛載機制**：具身環境 (如 `MinecraftEnv`) 同樣實作 `loadTools()`，將控制遊戲角色的工具動態注入給 `EmbodiedAgent`。

## 3. 執行資料流 (Data Flow)

1.  **綁定 (Binding)**：Agent 將其持有的 `BaseTool[]` 轉譯為 LLM 原生格式並綁定 (Bind) 到 Prompt 中。
2.  **呼叫 (Invocation)**：LLM 決定呼叫特定工具，回傳 Function Calling 要求。
3.  **攔截與紀錄 (Intercept & Record)**：在 `toLangChainTool()` 中攔截呼叫，並利用 `context.eventBus` 發送包含 `TOOL_CALL` 意圖的 `DataBlock` (角色為 `ai`) 以紀錄決策，打破 LangChain 內部的黑盒。
4.  **驗證與執行 (Validation & Execution)**：底層執行器先透過 `BaseTool.schema.parse()` 進行嚴格驗證，驗證通過後，將參數與 `ToolContext` 傳入 `BaseTool.execute()` 執行實體邏輯。
5.  **反饋與紀錄 (Feedback & Record)**：工具執行完畢（成功或拋出異常），再次利用 `context.eventBus` 發送包含 `TOOL_RESULT` 意圖的 `DataBlock` (角色為 `tool`) 作為執行結果的回報。結果同時被封裝為 `ToolMessage` 傳回給 LLM，完成單次交互與系統歷史的雙向同步。
