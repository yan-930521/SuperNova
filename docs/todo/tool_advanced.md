---
title: Tool 進階功能規劃
version: 0.1.0
status: DRAFT
last_updated: 2026-08-06
---

# Tool 進階功能規劃

> **[TODO]** 以下為工具系統已規劃但尚未實現的進階功能。

## 1. 沙盒隔離 (Sandbox Isolation)
計畫讓 `ToolContext` 提供更強大的沙盒隔離能力，確保檔案讀寫或環境操作被嚴格限制在該 Agent 專屬的目錄沙盒內，實踐「零信任安全架構」。

## 2. 工具權限控制 (Permission Control)
計畫在 `WorkspaceManager.loadTools` 中加入權限判斷，根據該 Agent 的權限 (例如是否唯讀) 來動態決定掛載的工具與操作限制。

## 3. 重試機制 (Retry Mechanism)
規劃為工具執行失敗時加入自動重試機制，提升工具呼叫的穩定性。

## 4. 環境動作工具 (ActionTools, 由 `EmbodiedEnv` 提供)
*   **包含**：例如 Minecraft 中的 `walk_to_target`、`mine_block` 等。
*   **掛載機制**：具身環境 (如 `MinecraftEnv`) 同樣實作 `loadTools()`，將控制遊戲角色的工具動態注入給 `EmbodiedAgent`。
