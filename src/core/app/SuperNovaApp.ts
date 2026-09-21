import { AgentManager } from '../agent/AgentManager';
import { ConfigLoader } from '@supernova/common/config/ConfigLoader';
import { AgentEvent, SystemEvent, IEvent } from '@supernova/events/IBus';
import { RuntimeKernel } from '../lifecycle/RuntimeKernel';
import { DataBlock } from '../messaging/DataBlock';
import { EventBus } from '@supernova/events/EventBus';
import { SessionManager } from '../session/SessionManager';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports/ConsoleTransport';

import { Config, ConfigSchema } from '../config/Config';
import { DEFAULT_CONFIG } from '../config/DefaultConfig';

export class SuperNovaApp {
    private kernel: RuntimeKernel | null = null;
    private eventBus: EventBus | null = null;
    private sessionManager: SessionManager | null = null;
    private agentManager: AgentManager | null = null;
    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'SuperNovaApp' }).addTransport(new ConsoleTransport('DEBUG'));

    /**
     * 啟動應用程式的核心與基礎設施
     * @param configPath 客製化配置檔路徑
     */
    public async start(configPath: string = "./config.yaml"): Promise<void> {
        const loader = new ConfigLoader<Config>(DEFAULT_CONFIG, ConfigSchema, this.logger);
        const config = await loader.bootstrap(configPath);
        this.kernel = new RuntimeKernel(config);

        await this.kernel.initialize();
        await this.kernel.start();

        const container = this.kernel.getContainer();
        this.eventBus = container.resolve<EventBus>('EventBus');
        this.sessionManager = container.resolve<SessionManager>('SessionManager');
        this.agentManager = container.resolve<AgentManager>('AgentManager');
        
        this.setupGracefulShutdown();
    }

    /**
     * 關閉應用程式內核
     */
    public async stop(): Promise<void> {
        if (this.kernel) {
            this.logger.info('Shutting down SuperNova system...');
            await this.kernel.stop();
            this.kernel = null;
            this.logger.info('SuperNova system shutdown successfully.');
        }
    }

    /**
     * 註冊優雅關閉機制
     */
    private setupGracefulShutdown(): void {
        const shutdownHandler = async () => {
            await this.stop();
            process.exit(0);
        };

        // 避免重複註冊
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.on('SIGINT', shutdownHandler);
        process.on('SIGTERM', shutdownHandler);
    }

    /**
     * 初始化或載入會話
     */
    public async initializeSession(sessionId: string, mainAgentId: string): Promise<void> {
        this.ensureInitialized();
        try {
            await this.sessionManager!.loadSession(sessionId);
            this.logger.info(`Loaded existing session: ${sessionId}`);
        } catch (e: any) {
            if (e.message && e.message.includes('Session not found')) {
                await this.sessionManager!.createSession(mainAgentId, sessionId, 'PERSISTENT');
                await this.sessionManager!.saveSession(sessionId);
                this.logger.info(`Successfully created new session: ${sessionId}`);
            } else {
                this.logger.error(`Failed to load existing session. Error: ${e.message}`);
                throw new Error(`Failed to load existing session. Error: ${e.message}`);
            }
        }
    }

    /**
     * 發送使用者訊息
     */
    public sendMessage(sessionId: string, text: string, targetId: string, senderName: string = "User"): void {
        this.ensureInitialized();
        const messageBlock = new DataBlock({
            sessionId: sessionId,
            senderId: 'USER',
            targetId: targetId,
            type: 'human',
            intent: 'USER_INPUT',
            controlPayload: text,
            metadata: { senderName }
        });

        this.eventBus!.publish({
            type: AgentEvent.AgentMessage,
            timestamp: Date.now(),
            sessionId: sessionId,
            payload: messageBlock
        });
    }

    /**
     * 手動觸發換日優化與總結
     */
    public triggerSessionOptimization(sessionId: string): void {
        this.ensureInitialized();
        this.eventBus!.publish({
            type: SystemEvent.SessionOptimization,
            timestamp: Date.now(),
            sessionId: sessionId,
            payload: { sessionId, targetDate: new Date().toLocaleDateString('en-CA') }
        });
    }

    /**
     * 註冊系統訊息接收回調
     */
    public onMessage(callback: (msg: DataBlock) => void): void {
        this.ensureInitialized();
        this.eventBus!.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
            const dataBlock = event.payload;
            if (Array.isArray(dataBlock)) {
                dataBlock.forEach(callback);
            } else {
                callback(dataBlock);
            }
        });
    }

    /**
     * 註冊 Agent 狀態轉為 IDLE 之間的回調 (適合用來重新顯示 Prompt)
     */
    public onAgentIdle(callback: (agentId: string) => void): void {
        this.ensureInitialized();
        this.eventBus!.subscribe(AgentEvent.AgentStateChanged, (event: IEvent<AgentEvent.AgentStateChanged>) => {
            const { agentId, newState } = event.payload;
            if (newState === 'IDLE') {
                callback(agentId);
            }
        });
    }

    private ensureInitialized(): void {
        if (!this.kernel || !this.eventBus || !this.sessionManager) {
            throw new Error('SuperNovaApp is not initialized. Please call start() first.');
        }
    }
}
