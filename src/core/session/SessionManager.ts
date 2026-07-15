import * as path from 'path';

import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { FileSystemSessionRepository, ISessionRepository } from '../infra/persistence';
import { IWorkspaceManager } from '../infra/persistence/IWorkspaceManager';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { IdGenerator } from '../utils/IdGenerator';
import { Session, SessionState } from './Session';

/**
 * SessionManager
 * 負責全局會話的建立、讀寫載入、存檔持久化與生命週期歸檔管理。
 * 支援系統啟動引導時的會話自動恢復流 (Session Recovery Flow) 與優雅停機 (Graceful Shutdown) 掛起。
 * 所有資料存取委託給 ISessionRepository 進行，徹底解耦本機檔案系統。
 */
export class SessionManager implements ILifecycle {
    private readonly logger = LogManager.recorder;
    private activeSessions: Map<string, Session> = new Map();
    private readonly sessionRepo: ISessionRepository;

    constructor(
        private readonly config: Config,
        private readonly workspaceManager?: IWorkspaceManager
    ) {
        const sessionBaseDir = path.join(process.cwd(), this.config.storage.base_dir, this.config.storage.session_dir);
        this.sessionRepo = new FileSystemSessionRepository(sessionBaseDir);
    }

    /**
     * 實作 ILifecycle 初始化方法
     */
    public async initialize(): Promise<void> {
        this.logger.info('[SessionManager] Initializing session manager...');
        try {
            if (this.sessionRepo.initialize) {
                await this.sessionRepo.initialize();
            }
        } catch (err: any) {
            this.logger.error(`[SessionManager] Failed to initialize session repository: ${err.message}`);
        }
    }

    /**
     * 實作 ILifecycle 啟動引導方法 (執行會話自動恢復流)
     */
    public async start(): Promise<void> {
        this.logger.info('[SessionManager] Starting SessionManager and running session recovery flow...');

        try {
            const dirs = await this.sessionRepo.list();
            for (const sessionId of dirs) {
                // 1. 讀取並載入會話資料
                const session = await this.sessionRepo.load(sessionId);
                if (!session) continue;

                // 2. 篩選出 ACTIVE 或 SUSPENDED 狀態的會話執行恢復
                if (session.status === SessionState.ACTIVE || session.status === SessionState.SUSPENDED) {
                    const workspaceType = session.metadata?.workspaceType || 'VOLATILE';

                    // 3. 容錯驗證：若是 PERSISTENT 類型，檢查其物理工作空間是否存在
                    if (this.workspaceManager) {
                        const isHealthy = await this.workspaceManager.hasWorkspace(sessionId, workspaceType);
                        if (!isHealthy) {
                            // 方案 B：偵測到 Workspace 毀損，將會話標記為 FAILED 並容錯跳過
                            this.logger.error(`[SessionManager] Session ${sessionId} workspace directory lost. Marking session as FAILED.`);
                            session.status = SessionState.FAILED;
                            session.touch();
                            await this.sessionRepo.save(session);
                            continue;
                        }
                    }

                    // 4. 工作空間健康，執行重啟還原
                    if (this.workspaceManager) {
                        try {
                            // 重新初始化與掛載儲存驅動
                            await this.workspaceManager.initWorkspace(sessionId, sessionId, workspaceType);
                            this.logger.info(`[SessionManager] Re-mounted workspace for session ${sessionId} (${workspaceType})`);
                        } catch (wsErr: any) {
                            this.logger.error(`[SessionManager] Failed to re-mount workspace for session ${sessionId}: ${wsErr.message}`);
                            session.status = SessionState.FAILED;
                            await this.sessionRepo.save(session);
                            continue;
                        }
                    }

                    // 將狀態恢復為 ACTIVE 並加載至活躍記憶體中
                    session.status = SessionState.ACTIVE;
                    session.touch();
                    await this.sessionRepo.save(session);
                    this.activeSessions.set(sessionId, session);

                    this.logger.info(`[SessionManager] Successfully recovered active session ${sessionId}`);
                }
            }
        } catch (error: any) {
            this.logger.error(`[SessionManager] Error running session recovery flow: ${error.message}`);
        }
    }

    /**
     * 實作 ILifecycle 停止方法 (優雅停機凍結)
     */
    public async stop(): Promise<void> {
        this.logger.info('[SessionManager] Stopping SessionManager and freezing active sessions...');

        // 遍歷所有記憶體中活躍的會話，更新為 SUSPENDED 凍結狀態並保存至磁碟
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (session.status === SessionState.ACTIVE) {
                session.status = SessionState.SUSPENDED;
                session.touch();
                try {
                    await this.sessionRepo.save(session);
                    this.logger.info(`[SessionManager] Suspended active session ${sessionId} due to graceful shutdown`);
                } catch (err: any) {
                    this.logger.error(`[SessionManager] Failed to suspend session ${sessionId}: ${err.message}`);
                }
            }
        }

        this.activeSessions.clear();
        this.logger.info('[SessionManager] SessionManager stopped');
    }

    /**
     * 建立一個新會話，代表一個與 MainAgent 的新對話
     */
    public createSession(
        mainAgentId: string,
        customSessionId?: string,
        workspaceType: 'VOLATILE' | 'PERSISTENT' = 'VOLATILE'
    ): Session {
        const sessionId = customSessionId || IdGenerator.session();
        const session = new Session({
            id: sessionId,
            mainAgentId,
            status: SessionState.ACTIVE,
            metadata: { workspaceType }
        });
        session.registerAgentId(mainAgentId);

        this.activeSessions.set(sessionId, session);
        this.logger.info(`[SessionManager] Created new session: ${sessionId} (${workspaceType}) for main agent: ${mainAgentId}`);
        return session;
    }

    /**
     * 獲取記憶體中活躍的會話實例
     */
    public getSession(sessionId: string): Session | null {
        return this.activeSessions.get(sessionId) || null;
    }

    /**
     * 從磁碟載入先前存檔的會話資料至記憶體中
     */
    public async loadSession(sessionId: string): Promise<Session> {
        try {
            const session = await this.sessionRepo.load(sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            this.activeSessions.set(sessionId, session);
            this.logger.info(`[SessionManager] Loaded session: ${sessionId} from repository`);
            return session;
        } catch (err: any) {
            this.logger.error(`[SessionManager] Failed to load session ${sessionId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * 將會話的狀態資料保存至磁碟
     */
    public async saveSession(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found in memory: ${sessionId}`);
        }
        await this.sessionRepo.save(session);
    }

    /**
     * 將會話標記為中斷（人機協同等待）並存檔
     */
    public async interruptSession(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        session.status = SessionState.INTERRUPTED;
        session.touch();
        await this.sessionRepo.save(session);
        this.logger.info(`[SessionManager] Session ${sessionId} marked as INTERRUPTED (Waiting for HITL)`);
    }

    /**
     * 喚醒並恢復中斷的會話
     */
    public async resumeSession(sessionId: string): Promise<Session> {
        let session = this.activeSessions.get(sessionId);
        if (!session) {
            session = await this.loadSession(sessionId);
        }

        session.status = SessionState.ACTIVE;
        session.touch();
        await this.sessionRepo.save(session);
        this.logger.info(`[SessionManager] Session ${sessionId} resumed to ACTIVE`);
        return session;
    }

    /**
     * 歸檔會話：釋放記憶體，並在磁碟標記為 ARCHIVED
     */
    public async archiveSession(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        session.status = SessionState.ARCHIVED;
        session.touch();
        await this.sessionRepo.save(session);

        this.activeSessions.delete(sessionId);
        this.logger.info(`[SessionManager] Session ${sessionId} archived and cleared from memory`);
    }
}
