---
title: Session & Messaging V2 架構設計
version: 2.0.0
status: DRAFT
last_updated: 2026-09-22
related_codes:
  - ../../../src/core/session/Session.ts
  - ../../../src/core/session/SessionManager.ts
  - ../../../src/core/messaging/DataBlock.ts
related_docs:
  - ../../ARCH.md
---

# Session & Messaging V2 架構設計

## 1. 核心哲學：隔離邊界與時間沙盒
在 SuperNova V2 中，**Session 不僅僅是聊天室，而是 Agent 協同思考的隔離邊界與時間沙盒**。
- **時空隔離**：所有 DataBlock 的流轉、收發件箱狀態與暫態記憶皆隔離在指定的 Session 內，確保多任務或人機互動間的上下文不互相污染。
- **零強制 I/O 依賴 (Memory-First)**：會話以純記憶體池（Memory Pool）高效運行，可選插入持久化儲存庫 (`ISessionRepository`)。
- **微核心服務集成 (Micro-Kernel Plugin)**：SessionManager 實作 `IKernelPlugin`，統一由 Kernel 託管生命週期，並向微核心註冊 `sessions` 與 `session_manager` 服務。

```mermaid
graph TD
    Kernel[SuperNova Kernel] -->|use plugin| SM[SessionManager]
    SM -->|publishes events| EB[EventBus]
    SM -->|manages| Pool[Session Pool (Map)]
    Pool --> S1[Session 1]
    Pool --> S2[Session 2]
    
    subgraph Session Sandbox
        S1 --> P[participantIds: Set]
        S1 --> IB[inboxBuffer: Map<agentId, DataBlock[]>]
        S1 --> Status[status: ACTIVE / PAUSED / CLOSED]
    end
```

---

## 2. 會話實體 (Session)

### 2.1 參與者管理
- `participantIds: Set<string>`：動態記錄參與此會話的 Agent 或實體。
- 推送訊息至收件箱時，目標 Agent 自動註冊至成員清單。

### 2.2 收件箱緩衝與行動喚醒 (Actionable Wakeup)
- 各 Agent 擁有隔離的收件緩衝區 `inboxBuffer`。
- **`hasActionableMessages(agentId, forceWakeupThreshold = 5)`**：
  1. **狀態保護**：若會話處於 `PAUSED`（等待使用者輸入/調試）或 `CLOSED`，一律凍結喚醒。
  2. **積壓門檻觸發**：收件箱積壓訊息達門檻（預設 5 則）時觸發喚醒。
  3. **優先度中斷**：若收到任意 `HIGH`（高優先）或 `URGENT`（緊急中斷）訊息，立即觸發喚醒。

---

## 3. 會話管理器 (SessionManager)

### 3.1 職責
1. **全局會話池管理**：`createSession`, `getSession`, `hasSession`, `listSessions`, `closeSession`, `removeSession`。
2. **EventBus 連動**：廣播 `SessionStarted`、`SessionUpdated`、`SessionClosed`。
3. **優雅停機 (Graceful Shutdown)**：在系統關閉時，自動將所有活躍中的會話標記為 `PAUSED` (SUSPENDED) 並安全存檔，清空記憶體池以避免狀態遺失。
4. **閒置過期清理**：可訂閱系統 Tick 定時檢查逾期會話並自動關閉。
