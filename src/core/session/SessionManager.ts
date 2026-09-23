import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { IEventBus, SessionEvent, SystemEvent } from '@supernova/events/IBus';
import { IKernel, IKernelPlugin } from '@supernova/runtime';

import { Session } from './Session';
import {
    ISession, ISessionManager, ISessionRepository, SessionManagerOptions, SessionParams,
    SessionState
} from './types';

export const DEFAULT_SESSION_MANAGER_NAME = "session_manager";

/**
 * 會話管理器 (SessionManager)
 * 實作 IKernelPlugin 與 ISessionManager，作為 Micro-Kernel 註冊之核心服務：
 * 1. 集中管理全局會話實例池 (Session Pool)
 * 2. 負責會話建立、查詢、生命週期狀態遷移與優雅停機 (Graceful Shutdown) 凍結
 * 3. 整合 EventBus 廣播會話生命週期事件 (SessionStarted, SessionClosed, SessionUpdated)
 * 4. 支援可選的持久化儲存庫 (ISessionRepository) 與逾期閒置會話清理
 */
export class SessionManager implements IKernelPlugin, ISessionManager {
    public readonly name = DEFAULT_SESSION_MANAGER_NAME;

    private kernel?: IKernel;
    private eventBus?: IEventBus;
    private repository?: ISessionRepository;
    private autoCleanupIdleMs: number = 0;

    /** 記憶體中活躍的會話實例池 (sessionId -> Session) */
    private readonly sessions = new Map<string, Session>();

    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'SessionManager' }).addTransport(
        new ConsoleTransport('DEBUG')
    );

    constructor(options: SessionManagerOptions = {}) {
        this.eventBus = options.eventBus;
        this.repository = options.repository;
        this.autoCleanupIdleMs = options.autoCleanupIdleMs ?? 0;
    }

    /**
     * 安裝外掛時注入宿主內核實例
     * @param kernel 微內核實例
     */
    public async install(kernel: IKernel): Promise<void> {
        this.kernel = kernel;
    }

    /**
     * 接收 Kernel 依賴並準備運行環境
     */
    public async initialize(): Promise<void> {
        this.logger.info('Initializing SessionManager...');

        if (this.kernel) {
            // 自動從 Kernel 獲取可用的事件總線
            if (!this.eventBus && this.kernel.hasService('events')) {
                this.eventBus = this.kernel.getService<IEventBus>('events');
            }

            // 自動從 Kernel 獲取可能存在的會話儲存庫
            if (!this.repository && this.kernel.hasService('session_repo')) {
                this.repository = this.kernel.getService<ISessionRepository>('session_repo');
            }
        }

        this.logger.info('SessionManager initialized successfully.');
    }

    /**
     * 啟動會話管理器並執行會話恢復流程
     */
    public async start(): Promise<void> {
        this.logger.info('Starting SessionManager and running session recovery flow...');

        // 1. 若配置了持久化儲存庫，執行會話恢復流程 (Session Recovery)
        if (this.repository) {
            await this.recoverSessions();
        }

        // 2. 若啟用自動過期清理且具備 EventBus，訂閱系統心跳 Tick
        if (this.autoCleanupIdleMs > 0 && this.eventBus) {
            this.eventBus.subscribe(SystemEvent.Tick, () => {
                this.cleanupExpiredSessions(this.autoCleanupIdleMs);
            });
            this.logger.info(
                `Subscribed to system ticks for session cleanup with idle threshold: ${this.autoCleanupIdleMs}ms`
            );
        }
    }

    /**
     * 從儲存庫恢復未關閉的會話至記憶體池
     * @returns 成功恢復的會話數量
     */
    public async recoverSessions(): Promise<number> {
        if (!this.repository) {
            return 0;
        }

        this.logger.info('Running session recovery from repository...');
        let recoveredCount = 0;

        try {
            // 優先使用 loadAll，若無定義則 fallback 至 list + load
            let sessions: ISession[] = [];
            if (typeof this.repository.loadAll === 'function') {
                sessions = await this.repository.loadAll();
            } else {
                const sessionIds = await this.repository.list();
                const loaded = await Promise.all(
                    sessionIds.map(async (id) => {
                        try {
                            return await this.repository!.load(id);
                        } catch (err: any) {
                            this.logger.warn(`Failed to load session [${id}] during recovery: ${err.message}`);
                            return null;
                        }
                    })
                );
                sessions = loaded.filter((s): s is ISession => s !== null);
            }

            for (const session of sessions) {
                // 僅恢復未關閉的會話 (ACTIVE 或 PAUSED)
                if (session.status === SessionState.ACTIVE || session.status === SessionState.PAUSED) {
                    // 若是因先前優雅停機而被標記為 SUSPENDED，恢復其為活躍狀態
                    if (session.closeReason === 'SUSPENDED') {
                        session.resume();
                        session.closeReason = undefined;
                        session.touch();
                        await this.repository.save(session).catch((err: any) => {
                            this.logger.warn(
                                `Failed to persist updated status for recovered session [${session.id}]: ${err.message}`
                            );
                        });
                    }

                    const sessionInstance =
                        session instanceof Session ? session : Session.fromJSON(session.toJSON());
                    this.sessions.set(sessionInstance.id, sessionInstance);
                    recoveredCount++;
                    this.logger.info(
                        `Successfully recovered session [${sessionInstance.id}] (status: ${sessionInstance.status})`
                    );
                }
            }

            this.logger.info(`Session recovery completed. Recovered ${recoveredCount} session(s).`);
        } catch (error: any) {
            this.logger.error(`Error during session recovery flow: ${error.message}`);
        }

        return recoveredCount;
    }

    /**
     * 優雅停機：凍結活躍會話並持久化
     */
    public async stop(): Promise<void> {
        this.logger.info('Stopping SessionManager and suspending active sessions...');

        // 遍歷所有會話，若處於活躍中則轉為暫停掛起 (SUSPENDED)
        const savePromises: Promise<void>[] = [];
        for (const session of this.sessions.values()) {
            if (session.status === SessionState.ACTIVE) {
                session.pause();
                session.closeReason = 'SUSPENDED';
                this.logger.debug(`Suspended session [${session.id}] due to shutdown.`);

                if (this.repository) {
                    savePromises.push(
                        this.repository.save(session).catch((err) => {
                            this.logger.error(`Failed to persist session [${session.id}] on shutdown: ${err.message}`);
                        })
                    );
                }
            }
        }

        await Promise.all(savePromises);
        this.sessions.clear();
        this.logger.info('SessionManager successfully stopped.');
    }

    /**
     * 手動注入或替換 EventBus
     */
    public setEventBus(eventBus: IEventBus): void {
        this.eventBus = eventBus;
    }

    /**
     * 手動注入或替換儲存庫
     */
    public setRepository(repo: ISessionRepository): void {
        this.repository = repo;
    }

    /**
     * 建立並註冊新的會話實體
     * @param params 初始化參數
     */
    public createSession(params: SessionParams = {}): Session {
        if (params.id && this.sessions.has(params.id)) {
            throw new Error(`Session already exists with id: ${params.id}`);
        }

        const session = new Session(params);
        this.sessions.set(session.id, session);
        this.logger.info(`Created new session [${session.id}]`);

        // 發佈會話建立事件
        if (this.eventBus) {
            this.eventBus.publish({
                type: SessionEvent.SessionStarted,
                sessionId: session.id,
                timestamp: Date.now(),
                payload: { sessionId: session.id },
            });
        }

        return session;
    }

    /**
     * 獲取指定 ID 的會話實例
     * @param sessionId 會話 ID
     */
    public getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * 檢查指定 ID 的會話是否存在於記憶體池中
     * @param sessionId 會話 ID
     */
    public hasSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /**
     * 取得記憶體中所有的會話列表
     */
    public listSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    /**
     * 取得目前處於 ACTIVE 狀態的活躍會話列表
     */
    public getActiveSessions(): Session[] {
        return Array.from(this.sessions.values()).filter((s) => s.status === SessionState.ACTIVE);
    }

    /**
     * 暫停指定會話
     * @param sessionId 會話 ID
     */
    public pauseSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        session.pause();
        this.logger.info(`Paused session [${sessionId}]`);

        if (this.eventBus) {
            this.eventBus.publish({
                type: SessionEvent.SessionUpdated,
                sessionId: session.id,
                timestamp: Date.now(),
                payload: { sessionId: session.id },
            });
        }

        return true;
    }

    /**
     * 恢復指定會話為活躍狀態
     * @param sessionId 會話 ID
     */
    public resumeSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        session.resume();
        this.logger.info(`Resumed session [${sessionId}]`);

        if (this.eventBus) {
            this.eventBus.publish({
                type: SessionEvent.SessionUpdated,
                sessionId: session.id,
                timestamp: Date.now(),
                payload: { sessionId: session.id },
            });
        }

        return true;
    }

    /**
     * 關閉指定會話
     * @param sessionId 會話 ID
     * @param reason 關閉原因
     */
    public closeSession(sessionId: string, reason?: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        session.close(reason);
        this.logger.info(`Closed session [${sessionId}], reason: ${reason ?? 'none'}`);

        if (this.eventBus) {
            this.eventBus.publish({
                type: SessionEvent.SessionClosed,
                sessionId: session.id,
                timestamp: Date.now(),
                payload: { sessionId: session.id },
            });
        }

        // 若有儲存庫，觸發異步存檔
        if (this.repository) {
            this.repository.save(session).catch((err) => {
                this.logger.error(`Failed to persist closed session [${sessionId}]: ${err.message}`);
            });
        }

        return true;
    }

    /**
     * 從記憶體會話池中移除指定會話
     * @param sessionId 會話 ID
     */
    public removeSession(sessionId: string): boolean {
        const deleted = this.sessions.delete(sessionId);
        if (deleted) {
            this.logger.info(`Removed session [${sessionId}] from memory pool`);
        }
        return deleted;
    }

    /**
     * 將指定會話手動存檔至儲存庫
     * @param sessionId 會話 ID
     */
    public async saveSession(sessionId: string): Promise<void> {
        if (!this.repository) {
            throw new Error('No session repository configured in SessionManager');
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found in memory pool: ${sessionId}`);
        }

        await this.repository.save(session);
        this.logger.info(`Saved session [${sessionId}] to repository`);
    }

    /**
     * 從儲存庫載入會話至記憶體池
     * @param sessionId 會話 ID
     */
    public async loadSession(sessionId: string): Promise<Session> {
        if (!this.repository) {
            throw new Error('No session repository configured in SessionManager');
        }

        const loaded = await this.repository.load(sessionId);
        if (!loaded) {
            throw new Error(`Session not found in repository: ${sessionId}`);
        }

        // 若不是 Session 實體則透過 toJSON / fromJSON 轉換
        const session = loaded instanceof Session ? loaded : Session.fromJSON(loaded.toJSON());
        this.sessions.set(session.id, session);
        this.logger.info(`Loaded session [${sessionId}] into memory pool`);

        return session;
    }

    /**
     * 檢查並清理超過閒置時間的未活躍會話
     * @param maxIdleMs 閒置容忍毫秒數
     * @returns 已清理的會話數量
     */
    public cleanupExpiredSessions(maxIdleMs: number): number {
        const now = Date.now();
        let cleanedCount = 0;

        for (const session of this.sessions.values()) {
            if (session.status !== SessionState.CLOSED) {
                const idleTime = now - session.updatedAt;
                if (idleTime >= maxIdleMs) {
                    this.closeSession(session.id, 'IDLE_TIMEOUT');
                    cleanedCount++;
                    this.logger.warn(`Session [${session.id}] expired after ${idleTime}ms idle time`);
                }
            }
        }

        return cleanedCount;
    }
}
