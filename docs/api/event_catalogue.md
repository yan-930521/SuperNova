---
title: 全局標準事件目錄規格 (Event Catalogue)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 全局標準事件目錄規格 (Event Catalogue)

本文件完整列舉 SuperNova 系統中經由 `EventBus` 廣播的所有標準事件類型、觸發時機與其強型別 Payload 結構定義。

---

## 1. 系統生命週期事件 (`SystemEvent`)

| 事件標識符 | 觸發時機 | Payload 欄位定義 |
| :--- | :--- | :--- |
| `system.kernel_started` | 微內核所有服務與外掛完成 `start()` 就緒時 | `{ timestamp: number }` |
| `system.kernel_stopped` | 微內核完成逆序優雅停機完全終止時 | `{ timestamp: number }` |
| `system.tick` | 內核定時心跳觸發 (依配置之間隔週期廣播) | `{ tickCount: number, timestamp: number }` |
| `system.service_registered` | 核心容器成功註冊新服務時 | `{ serviceName: string }` |

---

## 2. 會話生命週期事件 (`SessionEvent`)

| 事件標識符 | 觸發時機 | Payload 欄位定義 |
| :--- | :--- | :--- |
| `session.started` | 新會話實體建立並加入記憶體池時 | `{ sessionId: string, metadata?: Record<string, any> }` |
| `session.updated` | 會話狀態遷移 (如 PAUSED/RESUMED) 或參與者異動時 | `{ sessionId: string, status?: SessionState }` |
| `session.closed` | 會話被使用者、調度器或逾期清理器關閉時 | `{ sessionId: string, reason?: string }` |

---

## 3. 代理人生命週期與通訊事件 (`AgentEvent`)

| 事件標識符 | 觸發時機 | Payload 欄位定義 |
| :--- | :--- | :--- |
| `agent.registered` | 代理人註冊至全域 AgentManager 時 | `{ agentId: string, role?: string }` |
| `agent.state_changed` | 代理人狀態流轉 (如 `IDLE` ↔ `BUSY`) 時 | `{ agentId: string, oldState: AgentState, newState: AgentState }` |
| `agent.message_queued` | 新訊息被推入特定會話收件箱時 | `{ sessionId: string, agentId: string, blockId: string }` |
| `agent.message_dispatched` | 訊息路由器成功自收件箱取出並派發時 | `{ sessionId: string, agentId: string, count: number }` |

---

## 4. 步驟與攔截鉤子事件 (`HookEvent`)

| 事件標識符 | 觸發時機 | Payload 欄位定義 |
| :--- | :--- | :--- |
| `hook.before_agent_run` | 代理人接收到外部分發訊息即將開始思考前 | `{ agentId: string, sessionId: string, messages: any[] }` |
| `hook.after_agent_run` | 代理人完成單次外部呼叫的所有輪次後 | `{ agentId: string, sessionId: string, usageStats?: any }` |
| `hook.before_step` | 單一步驟呼叫 LLM 前觸發 | `{ agentId: string, stepIndex: number }` |
| `hook.after_step` | 單一步驟模型生成回覆與工具呼叫後觸發 | `{ agentId: string, stepIndex: number, modelResponse?: any }` |
| `hook.before_tool_execute` | 代理人即將調用特定工具前觸發 | `{ agentId: string, toolName: string, args: any }` |
| `hook.after_tool_execute` | 工具執行完成產生輸出後觸發 | `{ agentId: string, toolName: string, result: any, durationMs: number }` |
