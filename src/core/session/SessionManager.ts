import { AgentManager } from '../agent/AgentManager';
import { AgentState, AgentType } from '../agent/BaseAgent';
import { ProjectionHandler } from '../agent/ProjectionHandler';
import { Config } from '../config/Config';
import { LogManager } from '../infra/LogManager';
import { ISessionRepository } from '../infra/persistence';
import { IAgentStateRepository, IDataBlockRepository } from '../infra/persistence/IRepository';
import { IWorkspaceManager, WorkspaceType } from '../infra/persistence/IWorkspaceManager';
import { ILifecycle } from '../lifecycle/ILifecycle';
import { DataBlock, MessagePriority } from '../messaging/DataBlock';
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
    private activeTaskPromises: Set<Promise<void>> = new Set();
    constructor(
        private readonly config: Config,
        private readonly sessionRepo: ISessionRepository,
        private readonly workspaceManager: IWorkspaceManager,
        private readonly agentManager: AgentManager,
        private readonly dataBlockRepo: IDataBlockRepository,
        private readonly eventBus: IEventBus
    ) { }

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
            this.eventBus.subscribe(AgentEvent.AgentStateChanged, this.handleAgentStateChanged.bind(this));
            this.eventBus.subscribe(AgentEvent.ProjectionToggled, this.handleProjectionToggled.bind(this));
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

            // 使用 Promise.all 並行恢復所有會話，大幅加速啟動時間
            const recoveryPromises = dirs.map(async (sessionId) => {
                try {
                    // 1. 讀取並載入會話資料
                    const session = await this.sessionRepo.load(sessionId);
                    if (!session) return;

                    // 2. 篩選出 ACTIVE 或 SUSPENDED 狀態的會話執行恢復
                    if (session.status === SessionState.ACTIVE || session.status === SessionState.SUSPENDED) {
                        const workspaceType = session.metadata?.workspaceType || 'PERSISTENT';

                        // 3. 容錯驗證：若是 PERSISTENT 類型，檢查其物理工作空間是否存在
                        const isHealthy = await this.workspaceManager.hasWorkspace(sessionId, workspaceType);
                        if (!isHealthy) {
                            this.logger.error(`[SessionManager] Session ${sessionId} workspace directory lost. Marking session as FAILED.`);
                            session.status = SessionState.FAILED;
                            session.touch();
                            await this.sessionRepo.save(session);
                            return;
                        }

                        // 4. 工作空間健康，執行重啟還原
                        await this.workspaceManager.initWorkspace(sessionId, sessionId, workspaceType);
                        this.logger.info(`[SessionManager] Re-mounted workspace for session ${sessionId} (${workspaceType})`);

                        // 將狀態恢復為 ACTIVE 並加載至活躍記憶體中
                        session.status = SessionState.ACTIVE;
                        session.touch();
                        await this.sessionRepo.save(session);
                        this.activeSessions.set(sessionId, session);

                        this.logger.info(`[SessionManager] Successfully recovered active session ${sessionId}`);
                    }
                } catch (wsErr: any) {
                    this.logger.error(`[SessionManager] Failed to recover session ${sessionId}: ${wsErr.message}`);
                    try {
                        const failedSession = await this.sessionRepo.load(sessionId);
                        if (failedSession) {
                            failedSession.status = SessionState.FAILED;
                            await this.sessionRepo.save(failedSession);
                        }
                    } catch (e) {
                        // ignore secondary error
                    }
                }
            });

            await Promise.all(recoveryPromises);

        } catch (error: any) {
            this.logger.error(`[SessionManager] Error running session recovery flow: ${error.message}`);
        }
    }

    /**
     * 實作 ILifecycle 停止方法 (優雅停機凍結)
     */
    public async stop(): Promise<void> {
        this.logger.info('[SessionManager] Stopping SessionManager. Waiting for background tasks to complete...');

        if (this.activeTaskPromises.size > 0) {
            this.logger.info(`[SessionManager] Waiting for ${this.activeTaskPromises.size} active agent tasks...`);
            await Promise.all(Array.from(this.activeTaskPromises));
        }

        this.logger.info('[SessionManager] All agent tasks finished. Freezing active sessions...');

        // 遍歷所有記憶體中活躍的會話，更新為 SUSPENDED 凍結狀態並保存至磁碟
        // 使用 Promise.all 並行寫入，加速停機流程
        const stopPromises = Array.from(this.activeSessions.values()).map(async (session) => {
            if (session.status === SessionState.ACTIVE) {
                session.status = SessionState.SUSPENDED;
                session.touch();
                try {
                    await this.sessionRepo.save(session);
                    this.logger.info(`[SessionManager] Suspended active session ${session.id} due to graceful shutdown`);
                } catch (err: any) {
                    this.logger.error(`[SessionManager] Failed to suspend session ${session.id}: ${err.message}`);
                }
            }
        });

        await Promise.all(stopPromises);

        this.activeSessions.clear();
        this.logger.info('[SessionManager] SessionManager stopped');
    }

    /**
     * 建立一個新會話，代表一個與 MainAgent 的新對話
     */
    public async createSession(
        mainAgentId: string,
        customSessionId?: string,
        workspaceType: WorkspaceType = 'PERSISTENT',
        agentType: AgentType = AgentType.MAIN
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

        // 建立會話時，一併註冊與建立 MainAgent (強制預期此時不應存在同名 Agent)
        await this.agentManager.spawnAgent(agentType, mainAgentId, sessionId);

        this.logger.info(`[SessionManager] Created new session: ${sessionId} (${workspaceType}) for agent: ${mainAgentId} of type: ${agentType}`);
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

        // 1. 在寫入任何歷史或派發前，先處理真正超大型字串 (如 > 50KB 的 base64 圖片) 以免記憶體與 I/O 崩潰，但保留一般長度的工具回報
        const processedBlock = await this.dataBlockRepo.offloadLargePayloads(block.sessionId, block, 50000);

        // 2. 若發送者是系統內的 Agent，客觀寫入發送者的歷史紀錄
        if (session.registeredAgentIds.has(processedBlock.senderId)) {
            await this.dataBlockRepo.appendForAgent(processedBlock.sessionId, processedBlock.senderId, processedBlock).catch(e => {
                this.logger.error(`[SessionManager] Failed to append sender history: ${e}`);
            });
            // 同步執行舊紀錄的壓縮卸載 (保留最新 20 筆，其餘套用嚴格的 1000 bytes 壓縮閾值)
            await this.compactAgentHistory(processedBlock.sessionId, processedBlock.senderId);
        }

        // 3. 決定接收對象 (Target)
        // 注意：若是 tool 追蹤訊息，純粹是發送方自己的內部執行紀錄，不派發給任何人
        let targets: string[] = [];
        if (processedBlock.type !== 'tool' && processedBlock.targetId !== null) {
            targets = [processedBlock.targetId];
        }

        // 4. 執行派發迴圈
        for (const targetId of targets) {
            // 只有註冊在系統內的 Agent，我們才幫它維護專屬歷史與 Inbox
            if (session.registeredAgentIds.has(targetId)) {
                // (a) 寫入目標的歷史 Oplog
                await this.dataBlockRepo.appendForAgent(processedBlock.sessionId, targetId, processedBlock).catch(e => {
                    this.logger.error(`[SessionManager] Failed to append target history for ${targetId}: ${e}`);
                });

                // (b) 推入會話層級的 InboxBuffer
                session.pushToInbox(targetId, processedBlock);

                // (c) 嘗試分派 Inbox 內的任務給該 Agent
                await this.dispatchInboxForAgent(session, targetId);
            }
        }
    }

    /**
     * 監聽 Agent 狀態改變事件
     * 當 Agent 處理完畢回到 IDLE 時，主動檢查是否還有積壓在 Inbox 的訊息，避免訊息餓死
     */
    private async handleAgentStateChanged(event: IEvent<AgentEvent.AgentStateChanged>): Promise<void> {
        const { agentId, newState } = event.payload;
        const sessionId = event.sessionId;
        if (!sessionId) return;

        if (newState === 'IDLE') {
            const session = this.getSession(sessionId);
            if (session && session.getPendingSenders(agentId).length > 0) {
                this.logger.info(`[SessionManager] Agent ${agentId} is IDLE and has pending messages.Triggering dispatch.`);
                await this.dispatchInboxForAgent(session, agentId);
            }
        }
    }

    /**
     * 監聽投影狀態變更，並同步記錄在 Session Metadata 中
     */
    private async handleProjectionToggled(event: IEvent<AgentEvent.ProjectionToggled>): Promise<void> {
        const { targetAgentId, controllerId, enable } = event.payload;
        const sessionId = event.sessionId;

        if (!sessionId) {
            this.logger.warn(`[SessionManager] Ignored projection toggle: Missing sessionId.`);
            return;
        }

        let session = this.getSession(sessionId);
        if (!session) {
            try {
                session = await this.loadSession(sessionId);
            } catch {
                this.logger.warn(`[SessionManager] Ignored projection toggle for unknown session ${sessionId}`);
                return;
            }
        }

        if (enable) {
            session.setProjectedBodyId(controllerId, targetAgentId);
            this.logger.info(`[SessionManager] Projection started: ${controllerId} -> ${targetAgentId} in session`);
        } else {
            session.setProjectedBodyId(controllerId, null);
            this.logger.info(`[SessionManager] Projection ended for ${controllerId} in session`);
        }

        if (this.sessionRepo.save) {
            await this.sessionRepo.save(session);
        }
    }

    /**
     * 分派特定 Agent 的 Inbox 任務
     * 負責判斷是否需要派生 Clone 或退回 Inbox 等待
     */
    private async dispatchInboxForAgent(session: Session, agentId: string): Promise<void> {
        // TODO: 效能優化
        try {
            const mainAgent = await this.agentManager.rehydrate(agentId, session.id);

            // 排隊機制：如果 Agent 正在忙碌，則不派發，讓訊息留在 Inbox 內。
            // 系統會透過 handleAgentStateChanged 監聽 IDLE 事件並再次觸發 dispatch。
            if (mainAgent.getState() === AgentState.BUSY) {
                this.logger.debug(`[SessionManager] Agent ${agentId} is BUSY. Messages will be queued in inbox.`);
                return;
            }

            const pendingSenders = session.getPendingSenders(agentId);
            if (pendingSenders.length === 0) return;

            const messageBatches: DataBlock[][] = [];

            for (const senderId of pendingSenders) {
                const messages = session.popFromInboxBySender(agentId, senderId);
                if (messages.length === 0) continue;

                // 優先度過濾：如果這批訊息全部都是 LOW 優先度，則不喚醒 Agent (靜默)
                const hasActionableMessage = messages.some(m => m.priority > MessagePriority.LOW);
                if (!hasActionableMessage && messages.length < this.config.agent.force_wakeup_threshold) {
                    this.logger.debug(`[SessionManager] Ignored ${messages.length} LOW priority messages for agent ${agentId} from ${senderId}. Agent will not be resumed.`);
                    for (const m of messages) {
                        session.pushToInbox(agentId, m);
                    }
                    continue;
                }

                messageBatches.push(messages);
            }

            if (messageBatches.length === 0) return;

            let workerAgent = mainAgent;
            const projectedBodyId = session.getProjectedBodyId(agentId);

            // 若本尊正在投影 (靈魂轉移)，透過 ProjectionHandler 產生合成的執行器處理 Inbox
            if (projectedBodyId) {
                if (!mainAgent.projectionHandler || mainAgent.projectionHandler.body.id !== projectedBodyId) {
                    this.logger.info(`[SessionManager] Agent ${agentId} is projecting into ${projectedBodyId}. Initializing stateful ProjectionHandler!`);
                    const bodyAgent = await this.agentManager.rehydrate(projectedBodyId, session.id);
                    mainAgent.projectionHandler = new ProjectionHandler(mainAgent, bodyAgent, this.dataBlockRepo);
                }
                workerAgent = mainAgent.projectionHandler as any;
            } else {
                mainAgent.projectionHandler = null;
            }

            // 獨立非同步並行處理 (不 await，讓它在背景跑)
            const resumePromise = workerAgent.resume(messageBatches).catch(e => {
                this.logger.error(`[SessionManager] Agent ${workerAgent.id} failed to resume: ${e}`);
            }).finally(async () => {
                // 確保對話結束後，將本尊的最新狀態 (如 Token 消耗量、歷史指針) 存檔
                await this.agentManager.saveAgent(mainAgent.id).catch(e => {
                    this.logger.error(`[SessionManager] Failed to save main agent ${mainAgent.id} state: ${e}`);
                });

                this.activeTaskPromises.delete(resumePromise);
            });
            this.activeTaskPromises.add(resumePromise);

            // 保存會話狀態 (更新 Inbox 狀態)
            await this.sessionRepo.save(session).catch(e => {
                this.logger.error(`[SessionManager] Failed to save session state: ${e}`);
            });

        } catch (e) {
            this.logger.error(`[SessionManager] Failed to dispatch inbox for agent ${agentId}: ${e}`);
        }
    }

    /**
     * 掃描並壓縮指定 Agent 的歷史記錄，將 20 筆以前的大型字串 (>1000 bytes) 卸載為 DataPointer。
     * 避免剛執行的工具回報立即被壓縮導致 LLM 忘記細節，同時確保遠古歷史的空間與 Token 浪費降至最低。
     */
    private async compactAgentHistory(sessionId: string, agentId: string): Promise<void> {
        try {
            const allBlocks = await this.dataBlockRepo.findByAgent(sessionId, agentId);
            if (allBlocks.length <= this.config.agent.uncompressed_tail) return;

            let changed = false;
            const limit = allBlocks.length - this.config.agent.uncompressed_tail;

            for (let i = 0; i < limit; i++) {
                const originalBlock = allBlocks[i];
                // 對於舊歷史，使用極其嚴格的 1000 bytes 閾值進行檔案卸載
                const processedBlock = await this.dataBlockRepo.offloadLargePayloads(sessionId, originalBlock, 1000);
                if (processedBlock !== originalBlock) {
                    allBlocks[i] = processedBlock;
                    changed = true;
                }
            }

            if (changed) {
                // 如果有任何改變，覆寫回檔案
                await this.dataBlockRepo.saveForAgent(sessionId, agentId, allBlocks);
                this.logger.debug(`[SessionManager] Compacted and offloaded old history for agent ${agentId}`);
            }
        } catch (e) {
            this.logger.error(`[SessionManager] Failed to compact history for agent ${agentId}: ${e}`);
        }
    }
}
