---
title: 訊息路由器與排隊機制 (Message Router)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 訊息路由器與排隊機制 (Message Router)

訊息路由器 (`src/core/messaging/MessageRouter.ts`) 是 SuperNova 系統中負責事件調度、代理人狀態感知排隊 (BUSY/IDLE)、訊息安全分發與優雅停機任務追蹤的核心通訊協調器。

---

## 1. 核心職責與運作機制

```mermaid
flowchart TD
    QueueEvent["AgentMessageQueued 事件"] --> MR["MessageRouter"]
    MR --> Check1{"Session 存在 且\nhasActionableMessages()?"}
    Check1 -- 否 --> Wait["等待後續訊息累積"]
    Check1 -- 是 --> Check2{"Agent 狀態為 BUSY?"}

    Check2 -- 是 --> Queued["訊息保留於收件箱\n(等待 Agent 變為 IDLE)"]
    Check2 -- 否 --> Pop["session.popInbox(agentId)\n(取出訊息並清空隊列)"]

    Pop --> AutoSave["非同步通知 SessionManager\nsaveSession(sessionId) 落盤"]
    Pop --> LangChain["轉換為 BaseMessage[]"]
    LangChain --> Run["agent.run(messages)\n(加入 activeTasks 追蹤)"]

    IdleEvent["AgentStateChanged (-> IDLE)"] --> MR
    IdleEvent --> ScanActive["掃描該 Agent 參與之活躍會話\n若有待處理訊息則觸發派發"]
```

---

## 2. 關鍵排隊與防飢餓機制 (Anti-Starvation)

1. **狀態感知延遲派發**：
   - 當多方快速向同一代理人發送訊息時，若代理人正在執行長鏈路思考推理（處於 `AgentState.BUSY`），訊息路由器不會重複並行喚醒代理人造成狀態衝突，而是將訊息安全保存在會話的 `inboxBuffer` 中。
2. **空閒自動喚醒 (Idle Triggered Dispatch)**：
   - 路由器監聽 `AgentEvent.AgentStateChanged` 事件。
   - 一旦代理人完成當前輪次思考並轉回 `IDLE` 狀態，路由器立即遍歷該代理人所參與的所有會話，自動提取積壓的訊息並發起下一輪思考，徹底防止訊息餓死。
3. **消費即時落盤保障**：
   - 在執行 `session.popInbox(agentId)` 取出訊息後，路由器立即非同步呼叫 `sessionManager.saveSession(sessionId)`。
   - 確保磁碟上的 Session 檔案與記憶體狀態一致，防止伺服器異常中斷時產生重複消費。

---

## 3. 執行時序與任務追蹤 (Active Tasks)

```mermaid
sequenceDiagram
    autonumber
    participant EB as EventBus
    participant MR as MessageRouter
    participant Session as Session
    participant Agent as UniversalAgent

    EB->>MR: AgentMessageQueued { sessionId, agentId }
    MR->>Session: hasActionableMessages(agentId)
    Session-->>MR: true (達到喚醒條件)
    MR->>Agent: 檢查 state 是否為 BUSY
    Note over MR: 狀態為 IDLE，允許執行
    MR->>Session: popInbox(agentId)
    Session-->>MR: 回傳 DataBlock[]
    MR--)Session: 非同步 saveSession() 落盤
    MR->>MR: 將 taskPromise 加入 activeTasks
    MR->>Agent: agent.run(messages)
    Agent-->>MR: 推理完成 (移除 activeTasks)
    MR->>EB: 觸發 AgentStateChanged (IDLE)
```

---

## 4. 優雅停機保障 (Graceful Shutdown)

在微內核停機階段，`MessageRouter.stop()` 確保進行中的思考任務不被截斷：

```typescript
public async stop(): Promise<void> {
    this.logger.info(`Stopping MessageRouter, awaiting ${this.activeTasks.size} active tasks...`);
    
    // 等待所有目前正在進行中 (In-Flight) 的 Agent 推理任務完成
    if (this.activeTasks.size > 0) {
        await Promise.all(Array.from(this.activeTasks));
    }
    
    this.activeTasks.clear();
    this.logger.info('MessageRouter successfully stopped.');
}
```
