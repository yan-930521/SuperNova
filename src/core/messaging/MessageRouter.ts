import { DEFAULT_SESSION_MANAGER_NAME } from '@core/session';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { AgentEvent, IEventBus, SessionEvent } from '@supernova/events/IBus';
import { IKernel, IKernelPlugin } from '@supernova/runtime';

import { DEFAULT_AGENT_CONFIG } from '../config';
import { AgentManager, DEFAULT_AGENT_MANAGER_NAME } from '../agent/AgentManager';
import { AgentState } from '../agent/types';
import { ISessionManager, SessionState } from '../session/types';
import { DataBlock } from './DataBlock';
import { IMessageRouter, MessageRouterOptions } from './types';

export const DEFAULT_MESSAGE_ROUTER_NAME = 'message_router'

/**
 * 訊息路由器 (MessageRouter)
 * 作為 EventBus、Session 與 Agent 之間的即時神經中樞：
 * 1. 監聽 EventBus 事件，將 DataBlock 準確路由至目標 Session 的 Agent 收件箱
 * 2. 評估 Session 的行動喚醒條件 (hasActionableMessages)，決定是否即時喚醒 Agent
 * 3. 處理排隊與防餓死機制：Agent 處於 BUSY 時訊息安全暫存於 Inbox，回到 IDLE 時自動觸發派發
 * 4. 實作 IKernelPlugin 與優雅停機 (Graceful Shutdown)，等待進行中的思考任務完成
 */
export class MessageRouter implements IKernelPlugin, IMessageRouter {
    public readonly name = DEFAULT_MESSAGE_ROUTER_NAME;
    public readonly version = '0.3.1';

    private kernel?: IKernel;
    private eventBus?: IEventBus;
    private sessionManager?: ISessionManager;
    private agentManager?: AgentManager;
    private forceWakeupThreshold: number;

    /** 追蹤進行中的 Agent 喚醒任務 (供優雅停機等待) */
    private readonly activeTasks = new Set<Promise<any>>();

    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'MessageRouter' }).addTransport(
        new ConsoleTransport('DEBUG')
    );

    constructor(options: MessageRouterOptions = {}) {
        this.eventBus = options.eventBus;
        this.sessionManager = options.sessionManager;
        this.agentManager = options.agentManager;
        this.forceWakeupThreshold =
            options.forceWakeupThreshold ??
            options.agent?.force_wakeup_threshold ??
            DEFAULT_AGENT_CONFIG.force_wakeup_threshold;
    }

    /**
     * 安裝外掛時注入宿主內核實例
     * @param kernel 微內核實例
     */
    public async install(kernel: IKernel): Promise<void> {
        this.kernel = kernel;
    }

    /**
     * 接收 Kernel 依賴並註冊事件監聽器
     */
    public async initialize(): Promise<void> {
        this.logger.info('Initializing MessageRouter...');

        if (this.kernel) {
            if (!this.eventBus && this.kernel.hasService('events')) {
                this.eventBus = this.kernel.getService<IEventBus>('events');
            }
            if (!this.sessionManager && this.kernel.hasService(DEFAULT_SESSION_MANAGER_NAME)) {
                this.sessionManager = this.kernel.getService<ISessionManager>(DEFAULT_SESSION_MANAGER_NAME);
            }
            if (!this.agentManager && this.kernel.hasService(DEFAULT_AGENT_MANAGER_NAME)) {
                this.agentManager = this.kernel.getService<AgentManager>(DEFAULT_AGENT_MANAGER_NAME);
            }
        }

        // 訂閱 EventBus 事件
        if (this.eventBus) {
            // 統一攔截全局會話訊息 (SessionMessage：涵蓋人機對話、多Agent協同、系統廣播、工具執行)
            this.eventBus.subscribe(SessionEvent.SessionMessage, async (event) => {
                try {
                    const blocks = event.payload?.message;
                    if (!blocks || !Array.isArray(blocks)) return;

                    for (const block of blocks) {
                        const dataBlock = block instanceof DataBlock ? block : new DataBlock(block as any);
                        await this.route(dataBlock);
                    }
                } catch (err: any) {
                    this.logger.error(`Error handling SessionMessage in router: ${err.message}`);
                }
            });

            // 監聽 Agent 狀態變更：由 BUSY 轉為 IDLE 時自動檢查收件箱觸發喚醒 (避免訊息餓死)
            this.eventBus.subscribe(AgentEvent.AgentStateChanged, async (event) => {
                try {
                    const { agentId, newState } = event.payload;
                    if (newState === AgentState.IDLE) {
                        await this.handleAgentBecameIdle(agentId);
                    }
                } catch (err: any) {
                    this.logger.error(`Error handling AgentStateChanged in router: ${err.message}`);
                }
            });
        }

        this.logger.info('MessageRouter initialized successfully.');
    }

    public async start(): Promise<void> {
        this.logger.info('Starting MessageRouter...');
    }

    /**
     * 優雅停機：等待所有正在進行的 Agent 思考與工具呼叫任務完成
     */
    public async stop(): Promise<void> {
        this.logger.info('Stopping MessageRouter...');

        if (this.activeTasks.size > 0) {
            this.logger.info(`Waiting for ${this.activeTasks.size} active agent tasks to settle...`);
            await Promise.allSettled(Array.from(this.activeTasks));
        }

        this.activeTasks.clear();
        this.logger.info('MessageRouter successfully stopped.');
    }

    /**
     * 將 DataBlock 路由至目標會話的收件箱並評估喚醒
     * @param block 資料載體
     */
    public async route(block: DataBlock): Promise<void> {
        if (!this.sessionManager) {
            this.logger.warn(`Cannot route message [${block.id}]: SessionManager is not available`);
            return;
        }

        const session = this.sessionManager.getSession(block.sessionId);
        if (!session) {
            this.logger.warn(`Dropped message [${block.id}]: Session [${block.sessionId}] not found`);
            return;
        }

        if (session.status === SessionState.CLOSED) {
            this.logger.warn(`Dropped message [${block.id}]: Session [${block.sessionId}] is CLOSED`);
            return;
        }

        // 1. 單播模式：指定具體 targetId
        if (block.targetId && block.targetId !== '*') {
            session.pushToInbox(block.targetId, block);
            await this.dispatchSessionInbox(session.id, block.targetId);
            return;
        }

        // 2. 廣播模式：targetId 為 null 或 '*'
        const participants = Array.from(session.participantIds);
        for (const pid of participants) {
            // 預設廣播不重複投遞給發送者自身
            if (pid !== block.senderId) {
                session.pushToInbox(pid, block);
                await this.dispatchSessionInbox(session.id, pid);
            }
        }
    }

    /**
     * 檢查並嘗試分派特定 Agent 在特定會話中的收件箱訊息
     * 喚醒判定邏輯：
     * 1. 會話必須為 ACTIVE 狀態
     * 2. 滿足 session.hasActionableMessages (達數量門檻或具備 HIGH/URGENT 訊息)
     * 3. Agent 必須處於 IDLE 狀態 (若為 BUSY 則暫緩排隊，避免並發搶佔)
     * @param sessionId 會話 ID
     * @param agentId 目標 Agent ID
     * @returns 是否成功觸發喚醒
     */
    public async dispatchSessionInbox(sessionId: string, agentId: string): Promise<boolean> {
        if (!this.sessionManager || !this.agentManager) {
            return false;
        }

        const session = this.sessionManager.getSession(sessionId);
        if (!session || session.status !== SessionState.ACTIVE) {
            return false;
        }

        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            return false;
        }

        // 條件檢查：收件箱中是否有需要採取行動的訊息
        if (!session.hasActionableMessages(agentId, this.forceWakeupThreshold)) {
            return false;
        }

        // 排隊機制：若 Agent 目前正忙於前一個步驟，保留訊息在收件箱中排隊
        if (agent.state === AgentState.BUSY) {
            this.logger.debug(`Agent [${agentId}] is BUSY. Messages remain queued in session inbox.`);
            return false;
        }

        // 從收件箱取出累積的 DataBlock 並轉譯為 LangChain BaseMessage 陣列
        const blocks = session.popInbox(agentId);
        if (blocks.length === 0) {
            return false;
        }

        const messages = blocks.map((b) => b.toMessage(agentId));
        this.logger.info(`Dispatching ${messages.length} messages to agent [${agentId}] in session [${sessionId}]`);

        // 當收件箱被提取清空後，若配置了 SessionManager，非同步同步持久化狀態
        if (this.sessionManager) {
            this.sessionManager.saveSession(sessionId).catch((err) => {
                this.logger.debug(`Auto-save session after popInbox skipped: ${err.message}`);
            });
        }

        // 非同步調用 Agent 思考循環並納入 activeTasks 追蹤
        const taskPromise = agent.run(messages).catch((err) => {
            this.logger.error(`Error during agent [${agentId}] execution: ${err.message}`);
        }).finally(() => {
            this.activeTasks.delete(taskPromise);
        });

        this.activeTasks.add(taskPromise);
        return true;
    }

    /**
     * 當 Agent 變為 IDLE 時，主動遍歷該 Agent 所屬的所有活躍 Session，檢查是否有未處理之訊息並喚醒
     * @param agentId Agent ID
     */
    private async handleAgentBecameIdle(agentId: string): Promise<void> {
        if (!this.sessionManager) return;

        const activeSessions = this.sessionManager.getActiveSessions();
        for (const session of activeSessions) {
            if (session.hasParticipant(agentId) && session.hasPendingMessages(agentId)) {
                this.logger.debug(`Triggering delayed dispatch for newly IDLE agent [${agentId}] in session [${session.id}]`);
                await this.dispatchSessionInbox(session.id, agentId);
            }
        }
    }
}
