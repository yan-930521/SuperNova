---
title: 會話生命週期管理 (Session Manager)
version: 2.0.0
status: ACTIVE
last_updated: 2026-09-23
---

# 會話生命週期管理 (Session Manager)

會話管理器 (`src/core/session/SessionManager.ts`) 作為微內核的核心外掛服務，負責集中維護系統運行期的會話實體池 (Session Pool)、調度會話狀態流轉、執行定時閒置清理，並在系統啟動時執行自動化的**會話復原流程 (Session Recovery)**。

---

## 1. 核心職責與架構定位

```mermaid
flowchart TD
    Kernel["微內核 (Kernel)"] -->|生命週期管理| SM["SessionManager (IKernelPlugin)"]
    EB["事件總線 (EventBus)"] <-->|事件廣播與 Tick 訂閱| SM
    Repo["會話儲存庫 (ISessionRepository)"] <-->|持久化與復原| SM
    SM -->|池化管理| Pool["活躍會話池 (Map<sessionId, Session>)"]
```

1. **實例池管理 (Session Pool)**：以記憶體快取維護當前所有未關閉的會話實例，提供 O(1) 的查詢、暫停、恢復與關閉。
2. **生命週期事件廣播**：在會話建立、狀態變更與關閉時，向 EventBus 同步廣播標準事件 (`SessionStarted`, `SessionUpdated`, `SessionClosed`)。
3. **會話復原機制 (Session Recovery)**：在 `start()` 啟動期主動從磁碟儲存庫批次載入未完成會話，確保系統重啟後的會話無縫延續。
4. **優雅停機凍結 (Graceful Shutdown)**：在 `stop()` 停機期將所有活躍會話切換為 `SUSPENDED` 並非同步批次保存至儲存庫。

---

## 2. 會話復原流程 (Session Recovery Flow)

當微內核開機啟動 `SessionManager.start()` 時，若配置了儲存庫，會自動執行會話復原：

```mermaid
sequenceDiagram
    autonumber
    participant SM as SessionManager
    participant Repo as ISessionRepository
    participant Pool as Memory Pool (this.sessions)

    SM->>Repo: loadAll() 批次載入磁碟會話
    Repo-->>SM: 回傳所有持久化的 ISession[]
    loop 遍歷每一筆會話
        alt 狀態為 ACTIVE 或 PAUSED(closeReason === 'SUSPENDED')
            Note over SM: 判定為停機掛起之會話
            SM->>SM: session.resume() (恢復為 ACTIVE)
            SM->>SM: 清除 closeReason 並 touch()
            SM->>Repo: save(session) (更新磁碟為活躍)
            SM->>Pool: 加入記憶體池 (set)
        else 狀態為 CLOSED
            Note over SM: 已結束會話不加載至記憶體池 (節省資源)
        end
    end
    Note over SM: 復原完成，就緒接收新事件
```

---

## 3. 定時逾期閒置回收 (Idle Cleanup)

在配置了 `autoCleanupIdleMs > 0` 的情況下，`SessionManager` 自動訂閱 `SystemEvent.Tick`：

```typescript
public cleanupExpiredSessions(maxIdleMs: number): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const session of this.sessions.values()) {
        if (session.status !== SessionState.CLOSED) {
            const idleTime = now - session.updatedAt;
            if (idleTime >= maxIdleMs) {
                // 逾期超時，自動關閉並存檔至儲存庫
                this.closeSession(session.id, 'IDLE_TIMEOUT');
                cleanedCount++;
                this.logger.warn(`Session [${session.id}] expired after ${idleTime}ms idle time`);
            }
        }
    }

    return cleanedCount;
}
```

---

## 4. 關鍵介面規範

```typescript
export interface ISessionManager {
    createSession(params?: SessionParams): ISession;
    getSession(sessionId: string): ISession | undefined;
    hasSession(sessionId: string): boolean;
    listSessions(): ISession[];
    getActiveSessions(): ISession[];
    closeSession(sessionId: string, reason?: string): boolean;
    pauseSession(sessionId: string): boolean;
    resumeSession(sessionId: string): boolean;
    removeSession(sessionId: string): boolean;
    saveSession(sessionId: string): Promise<void>;
    loadSession(sessionId: string): Promise<ISession>;
    cleanupExpiredSessions(maxIdleMs: number): number;
    recoverSessions?(): Promise<number>;
}
```
