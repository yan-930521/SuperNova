import mineflayer from 'mineflayer';

import { infra, lifecycle, messaging } from '../../core';
import { SuperNovaBot } from './wrapper/SuperNovaBot';

export interface BotContext {
    bot: SuperNovaBot;
    agentId: string;
    sessionId: string;
    eventBus: messaging.EventBus;
}
export class BotManager implements lifecycle.ILifecycle {
    private bots: Map<string, BotContext> = new Map();
    private eventBus: messaging.EventBus;
    private logger = infra.LogManager.recorder;

    constructor(eventBus: messaging.EventBus) {
        this.eventBus = eventBus;
    }

    public async initialize(): Promise<void> {
        this.logger.info('[BotManager] Initialized.');
    }

    public async stop(): Promise<void> {
        for (const [agentId, ctx] of this.bots.entries()) {
            ctx.bot.stopAll();
            ctx.bot.core.quit();
            this.logger.info(`[BotManager] Bot for agent ${agentId} disconnected during shutdown.`);
        }
        this.bots.clear();
        this.logger.info('[BotManager] Stopped.');
    }

    public async spawnBot(host: string, port: number, username: string, agentId: string, sessionId: string): Promise<BotContext> {
        if (this.bots.has(agentId)) {
            this.logger.info(`[BotManager] Bot for Agent ${agentId} is already running.`);
            return this.bots.get(agentId)!;
        }

        this.logger.info(`[BotManager] Spawning bot ${username} for agent ${agentId} at ${host}:${port}...`);
        
        const rawBot = mineflayer.createBot({ host, port, username, auth: 'offline' });
        const snBot = new SuperNovaBot(rawBot);
        
        rawBot.on('spawn', async () => {
            if(rawBot.inventory.containerItems().length > 0) return;
            
            // 測試是否有 /give 的權限 (等同 OP)
            let isOp = false;
            try {
                const matches = await rawBot.tabComplete('/give ');
                if (matches && matches.length > 0) {
                    isOp = true;
                }
            } catch (err) {
                this.logger.warn(`[BotManager] Error checking permissions: ${err}`);
            }

            if (!isOp) {
                this.logger.info(`[BotManager] Bot ${username} does not have OP/give permissions. Skipping initial gear setup.`);
                return;
            }

            this.logger.info(`[BotManager] Bot ${username} has OP permissions. Initializing inventory and health...`);
            rawBot.chat('/clear @s');
            
            const items = [
                'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots',
                'diamond_sword', 'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_hoe',
                'bow{Enchantments:[{id:unbreaking,lvl:3}]}', 'arrow 300', 'shield'
            ];
            
            for (const item of items) {
                rawBot.chat(`/give @s ${item}`);
                await new Promise(r => setTimeout(r, 100)); // 避免刷頻
            }

            rawBot.chat('/effect give @s instant_health 1 255');
            rawBot.chat('/effect give @s saturation 1 255');
        });
        
        const context: BotContext = {
            bot: snBot,
            agentId,
            sessionId,
            eventBus: this.eventBus
        };
        
        return new Promise((resolve, reject) => {
            const onSpawn = () => {
                this.logger.info(`[BotManager] Bot ${username} successfully spawned and is ready.`);
                this.bots.set(agentId, context);
                cleanup();
                resolve(context);
            };

            const onError = (err: Error) => {
                this.logger.error(`[BotManager] Bot ${username} encountered an error during spawn: ${err}`);
                cleanup();
                reject(err);
            };

            const onKicked = (reason: string) => {
                this.logger.warn(`[BotManager] Bot ${username} was kicked during spawn. Reason: ${reason}`);
                cleanup();
                reject(new Error(`Kicked: ${reason}`));
            };

            const cleanup = () => {
                rawBot.removeListener('spawn', onSpawn);
                rawBot.removeListener('error', onError);
                rawBot.removeListener('kicked', onKicked);
            };

            rawBot.on('spawn', onSpawn);
            rawBot.on('error', onError);
            rawBot.on('kicked', onKicked);
        });
    }

    public getBotContext(agentId: string): BotContext | undefined {
        return this.bots.get(agentId);
    }
    
    public getAllBots(): BotContext[] {
        return Array.from(this.bots.values());
    }

    public destroyBot(agentId: string): void {
        const ctx = this.bots.get(agentId);
        if (ctx) {
            ctx.bot.stopAll();
            ctx.bot.core.quit();
            this.bots.delete(agentId);
            this.logger.info(`[BotManager] Destroyed bot for agent ${agentId}`);
        }
    }
}
