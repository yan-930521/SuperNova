import { infra, lifecycle } from '../../core';
import { IEventBus } from '../../core/domain/IBus';
import { RpcClient, MobController } from '../novalink/novalink-sdk';

export interface MobContext {
    bot: MobController;
    agentId: string;
    sessionId: string;
    eventBus: IEventBus;
}

export class MobManager implements lifecycle.ILifecycle {
    private bots: Map<string, MobContext> = new Map();
    private eventBus: IEventBus;
    private logger = infra.LogManager.recorder;
    public rpcClient: RpcClient;

    constructor(eventBus: IEventBus) {
        this.eventBus = eventBus;
        this.rpcClient = new RpcClient('ws://127.0.0.1:8080');
    }

    public async initialize(): Promise<void> {
        this.logger.info('[MobManager] Initializing RpcClient...');
        await this.rpcClient.waitForConnection();
        this.logger.info('[MobManager] RpcClient Initialized.');
    }

    public async stop(): Promise<void> {
        for (const [agentId, ctx] of this.bots.entries()) {
            await ctx.bot.stopMove().catch(() => {});
            this.logger.info(`[MobManager] Mob for agent ${agentId} disconnected during shutdown.`);
        }
        this.bots.clear();
        this.logger.info('[MobManager] Stopped.');
    }

    public async spawnBot(uuid: string, agentId: string, sessionId: string): Promise<MobContext> {
        if (this.bots.has(agentId)) {
            this.logger.info(`[MobManager] Mob for Agent ${agentId} is already running.`);
            return this.bots.get(agentId)!;
        }

        this.logger.info(`[MobManager] Spawning MobController for agent ${agentId} (UUID: ${uuid})...`);
        
        const mobController = new MobController(this.rpcClient, uuid);
        
        const context: MobContext = {
            bot: mobController,
            agentId,
            sessionId,
            eventBus: this.eventBus
        };
        
        this.bots.set(agentId, context);
        return context;
    }

    public getBotContext(agentId: string): MobContext | undefined {
        return this.bots.get(agentId);
    }
    
    public getAllBots(): MobContext[] {
        return Array.from(this.bots.values());
    }

    public destroyBot(agentId: string): void {
        const ctx = this.bots.get(agentId);
        if (ctx) {
            ctx.bot.stopMove().catch(() => {});
            this.bots.delete(agentId);
            this.logger.info(`[MobManager] Destroyed MobController for agent ${agentId}`);
        }
    }
}
