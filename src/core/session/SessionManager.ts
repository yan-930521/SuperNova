import { AgentManager } from '../agent/AgentManager';
import { AgentState, AgentType } from '../agent/BaseAgent';
import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { ISessionRepository } from '../infra/persistence';
import { IDataBlockRepository } from '../infra/persistence/IRepository';
import { IWorkspaceManager } from '../infra/persistence/IWorkspaceManager';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { AgentEvent, IEvent, IEventBus } from '../messaging/IBus';
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
    constructor(
        private readonly config: Config,
        private readonly sessionRepo: ISessionRepository,
        private readonly workspaceManager: IWorkspaceManager,
        private readonly agentManager: AgentManager,
        private readonly dataBlockRepo: IDataBlockRepository,
        private readonly eventBus: IEventBus
    ) {}

    /**
     * 實作 ILifecycle 初始化方法
     */
    public async initialize(): Promise<void> {
        this.logger.info('[SessionManager] Initializing session manager...');
        try {
            if (this.sessionRepo.initialize) {
                await this.sessionRepo.initialize();
            }
            
            // 統一監聽全局的 AgentMessage 進行派發與存檔
            this.eventBus.subscribe(AgentEvent.AgentMessage, this.handleAgentMessage.bind(this));
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
                    const workspaceType = session.metadata?.workspaceType || 'PERSISTENT';

                    // 3. 容錯驗證：若是 PERSISTENT 類型，檢查其物理工作空間是否存在
                    const isHealthy = await this.workspaceManager.hasWorkspace(sessionId, workspaceType);
                    if (!isHealthy) {
                        // 方案 B：偵測到 Workspace 毀損，將會話標記為 FAILED 並容錯跳過
                        this.logger.error(`[SessionManager] Session ${sessionId} workspace directory lost. Marking session as FAILED.`);
                        session.status = SessionState.FAILED;
                        session.touch();
                        await this.sessionRepo.save(session);
                        continue;
                    }

                    // 4. 工作空間健康，執行重啟還原
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
    public async createSession(
        mainAgentId: string,
        customSessionId?: string,
        workspaceType: 'VOLATILE' | 'PERSISTENT' = 'PERSISTENT'
    ): Promise<Session> {
        const sessionId = customSessionId || IdGenerator.session();
        const session = new Session({
            id: sessionId,
            mainAgentId,
            status: SessionState.ACTIVE,
            metadata: { workspaceType }
        });
        session.registerAgentId(mainAgentId);

        await this.workspaceManager.initWorkspace(sessionId, sessionId, workspaceType);

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

    /**
     * 統一攔截並派發 AgentMessage
     * 將訊息寫入歷史 (Oplog)、推入 Session Inbox，最後喚醒 (Resume) 目標 Agent
     */
    private async handleAgentMessage(event: IEvent<AgentEvent.AgentMessage>): Promise<void> {
        const block = event.payload;
        if (!block) return;

        // 確保 Session 存在
        let session = this.getSession(block.sessionId);
        if (!session) {
            try {
                session = await this.loadSession(block.sessionId);
            } catch {
                this.logger.warn(`[SessionManager] Ignored message for unknown session ${block.sessionId}`);
                return;
            }
        }

        // 1. 若發送者是系統內的 Agent，客觀寫入發送者的歷史紀錄
        // (如果是 USER 或外部 Env 發送則略過寫入，避免產生多餘的 history.jsonl)
        if (session.registeredAgentIds.has(block.senderId)) {
            await this.dataBlockRepo.appendForAgent(block.sessionId, block.senderId, block).catch(e => {
                this.logger.error(`[SessionManager] Failed to append sender history: ${e}`);
            });
        }

        // 2. 決定接收對象 (Target or Broadcast)
        const targets = block.targetId 
            ? [block.targetId] 
            : Array.from(session.registeredAgentIds).filter(id => id !== block.senderId);

        // 3. 執行派發迴圈
        for (const targetId of targets) {
            // 只有註冊在系統內的 Agent，我們才幫它維護專屬歷史與 Inbox
            if (session.registeredAgentIds.has(targetId)) {
                // (a) 寫入目標的歷史 Oplog
                await this.dataBlockRepo.appendForAgent(block.sessionId, targetId, block).catch(e => {
                    this.logger.error(`[SessionManager] Failed to append target history for ${targetId}: ${e}`);
                });

                // (b) 推入會話層級的 InboxBuffer
                session.pushToInbox(targetId, block);
                
                // (c) 嘗試喚醒該 Agent 或其分身 (Clone Mode 並發消化)
                try {
                    const mainAgent = await this.agentManager.rehydrate(targetId, block.sessionId);
                    
                    const pendingSenders = session.getPendingSenders(targetId);
                    for (const senderId of pendingSenders) {
                        const messages = session.popFromInboxBySender(targetId, senderId);
                        if (messages.length === 0) continue;

                        const hasUrgent = messages.some(m => m.priority > 0); // HIGH or URGENT

                        let workerAgent = mainAgent;

                        if (mainAgent.status === AgentState.IDLE || mainAgent.status === AgentState.SUSPENDED) {
                            // 本尊空閒，直接指派給本尊
                            // (注意：若是我們改變了狀態，後續迴圈的下一個 sender 就會遇到 BUSY，從而觸發 Clone)
                        } else if (hasUrgent || mainAgent.canClone) {
                            // 本尊忙碌中，但有高優先級訊息，或本尊支援分身併發 -> 派生 SubAgent 分身！
                            workerAgent = await this.agentManager.spawnAgent(
                                AgentType.SUB, 
                                IdGenerator.agent('sub'),
                                block.sessionId, 
                                { isClone: true, parentAgent: mainAgent }
                            );
                            
                            // 拷貝本尊的大腦設定 (Profile) 與工具集 (Tools)
                            const parentProfile = mainAgent.getProfile();
                            if (parentProfile) {
                                workerAgent.setProfile(parentProfile);
                            }
                        } else {
                            // 本尊忙碌，且不支援分身，只能乖乖放回 Inbox 排隊
                            for (const m of messages) {
                                session.pushToInbox(targetId, m);
                            }
                            continue; // 跳過，等下次 resume
                        }

                        const isClone = workerAgent !== mainAgent;

                        // 獨立非同步並行處理 (不 await，讓它在背景跑)
                        workerAgent.resume(messages).catch(e => {
                            this.logger.error(`[SessionManager] Agent ${workerAgent.id} failed to resume: ${e}`);
                        }).finally(async () => {
                            if (isClone) {
                                // 1. 合併分身的 Token 消耗與資源統計回本尊
                                mainAgent.mergeUsage(workerAgent.getUsageStats());
                                
                                // 2. 併發分身處理完畢後，立即執行垃圾回收 (GC) 徹底銷毀
                                await this.agentManager.terminateAgent(workerAgent.id);
                            }
                        });
                    }

                } catch (err: any) {
                    this.logger.error(`[SessionManager] Failed to dispatch message to agent ${targetId}: ${err.message}`);
                }
            }
        }

        // 4. 保存會話狀態 (更新 Inbox)
        await this.sessionRepo.save(session).catch(e => {
            this.logger.error(`[SessionManager] Failed to save session state: ${e}`);
        });
    }
}
