import * as readline from 'readline';

import { EmbodiedAgent } from '@core/agent';
import { AgentEvent, IEvent } from '@core/domain/IBus';
import { ICodeSkillRepository } from '@core/domain/ICodeSkillRepository';
import { LogManager } from '@core/infra';
import { CodeSkillContext, ObservationSkill } from '@core/skill/BaseSkill';
import { SkillManager } from '@core/skill/SkillManager';
import {
    CreateCodeSkillTool, DeleteCodeSkillTool, ExecuteCodeSkillTool, ReadCodeSkillTool, RollbackCodeSkillTool, TestCodeSkillTool
} from '../../core/tools/CodeSkillTools';

import { agent, config, lifecycle, messaging, session } from '../../core';
import { BotManager } from './BotManager';
import { setupAgentEvents } from './events/agentEvents';
import { setupMineflayerEvents } from './events/mineflayerEvents';
import { seedSkills } from './wrapper/SkillSeeder';

export class UnderworldApplication {
    private kernel!: lifecycle.RuntimeKernel;
    private eventBus!: messaging.EventBus;
    private agentManager!: agent.AgentManager;
    private sessionManager!: session.SessionManager;
    private codeSkillRepo!: ICodeSkillRepository;
    private botManager!: BotManager;
    private skillManager!: SkillManager;
    private rl?: readline.Interface;

    private readonly MainAgentId = 'shimo-main';
    private readonly EmbodiedAgentId = 'minecraft-bot-01';
    private readonly sessionId = 'underworld-session';

    private readonly logger = LogManager.recorder;

    public async bootstrap(): Promise<void> {
        console.log('=============================================');
        console.log('   SuperNova Minecraft Underworld Node');
        console.log('=============================================');

        this.kernel = new lifecycle.RuntimeKernel(config.DEFAULT_CONFIG);
        await this.kernel.initialize();
        await this.kernel.start();

        const container = this.kernel.getContainer();
        this.eventBus = container.resolve<messaging.EventBus>('EventBus');
        this.agentManager = container.resolve<agent.AgentManager>('AgentManager');
        this.sessionManager = container.resolve<session.SessionManager>('SessionManager');
        this.codeSkillRepo = container.resolve<ICodeSkillRepository>('ICodeSkillRepository');
        
        this.botManager = new BotManager(this.eventBus);
        await this.botManager.initialize();

        this.setupProcessEvents();
    }

    public async initSession(): Promise<void> {
        try {
            await this.sessionManager.loadSession(this.sessionId);
            console.log(`[系統] 載入既有會話: ${this.sessionId}`);
        } catch (e: any) {
            if (e.message && e.message.includes('Session not found')) {
                // 委託 SessionManager 建立會話與主中樞 (MainAgent)
                const sessionInst = await this.sessionManager.createSession(
                    this.MainAgentId,
                    this.sessionId,
                    'PERSISTENT',
                    agent.AgentType.MAIN
                );

                // 定義 Minecraft 專屬的環境 API，讓 LLM (夏沫) 知道怎麼操作
                const botSdkDeclaration = `
    import { Bot } from 'mineflayer';
    import { Entity } from 'prismarine-entity';
    import { Block } from 'prismarine-block';

    export interface SuperNovaBot {
        readonly core: Bot;
        isMoving(): boolean;
        moveTo(x: number, y: number, z: number): void;
        follow(entity: Entity, range?: number): void;
        stopMoving(): void;
        chat(message: string): void;
        whisper(player: string, message: string): void;
        isAttacking(): boolean;
        stopCombat(): void;
        attackTarget(target: Entity, preferWeapon?: 'bow' | 'sword'): Promise<void>;
        digBlock(block: Block, requireHarvest?: boolean): Promise<void>;
        stopDigging(): void;
        stopAll(): void;
    }
    
    // 覆寫 TEnv 的型別為 SuperNovaBot
    interface CodeSkillContext {
        env: SuperNovaBot;
    }
    abstract class BaseSkill {
        protected readonly env: SuperNovaBot;
    }
`;

                // 手動生成右腦 (EmbodiedAgent) 並註冊到同一個 Session 中，並注入 SDK 宣告
                await this.agentManager.spawnAgent(agent.AgentType.EMBODIED, this.EmbodiedAgentId, this.sessionId, {
                    envSdkDeclaration: botSdkDeclaration
                });
                
                sessionInst.registerAgentId(this.EmbodiedAgentId);
                await this.sessionManager.saveSession(this.sessionId);

                console.log(`[系統] 成功建立新會話: ${this.sessionId}`);
            } else {
                console.error(`[系統] 讀取既有會話失敗，可能是檔案損毀，為避免覆寫已中斷啟動。錯誤: ${e.message}`);
                process.exit(1);
            }
        }
    }

    public async configureAgents(): Promise<void> {
        const container = this.kernel.getContainer();
        const workspaceManager = container.resolve<any>('IWorkspaceManager');
        const toolRegistry = this.agentManager.getToolRegistry();

        // 1. 將包含 Minecraft 實體與 Agent 狀態樹的 CodeSkillContext 註冊進特化版的 Tool 中
        const getCodeSkillContext = (agentId: string) : CodeSkillContext => {
            const ctx = this.botManager.getBotContext(agentId);
            const agent = this.agentManager.getAgent(agentId) as EmbodiedAgent;
            return {
                state: agent?.stateRegistry,
                eventBus: this.eventBus,
                env: ctx?.bot
            };
        };

        this.skillManager = new SkillManager(this.codeSkillRepo, getCodeSkillContext);

        // 覆寫 Core 層的動態技能工具，注入含有 Minecraft Bot 的環境與 SkillManager 快取機制
        toolRegistry.register(new ExecuteCodeSkillTool(workspaceManager, this.skillManager));
        toolRegistry.register(new CreateCodeSkillTool(this.codeSkillRepo, this.skillManager));
        toolRegistry.register(new RollbackCodeSkillTool(this.codeSkillRepo, this.skillManager));
        toolRegistry.register(new DeleteCodeSkillTool(this.codeSkillRepo, this.skillManager));
        
        // 註冊 TestCodeSkillTool
        toolRegistry.register(new TestCodeSkillTool(workspaceManager));
        
        // 2. 取得剛建立的 Right Brain (EmbodiedAgent) 進行配置
        const mcAgent = await this.agentManager.rehydrate(this.EmbodiedAgentId, this.sessionId);
        const embodiedDefaults = this.agentManager.getDefaultTools(agent.AgentType.EMBODIED);
        mcAgent.updateTools(toolRegistry.getTools([...embodiedDefaults, 'execute_code_skill', 'test_code_skill']));

        // 3. 取得 MainAgent 進行配置
        const mainAgent = await this.agentManager.rehydrate(this.MainAgentId, this.sessionId);
        const mainDefaults = this.agentManager.getDefaultTools(agent.AgentType.MAIN);
        mainAgent.updateTools(toolRegistry.getTools(mainDefaults));

        console.log(`[系統] 完成代理配置。目前啟動代理數量: 2`);
    }

    public async startMinecraftBot(): Promise<void> {
        const host = process.env.MINECRAFT_HOST || '127.0.0.1';
        const port = parseInt(process.env.MINECRAFT_PORT || '25565', 10);
        const username = process.env.MINECRAFT_USERNAME || 'SuperNovaBot';

        const ctx = await this.botManager.spawnBot(
            host,
            port,
            username,
            this.EmbodiedAgentId,
            this.sessionId
        );

        await seedSkills(this.codeSkillRepo, this.sessionId, this.EmbodiedAgentId);
        setupMineflayerEvents(ctx.bot.core, this.eventBus, this.sessionId, this.EmbodiedAgentId, this.MainAgentId);
        setupAgentEvents(ctx.bot.core, this.eventBus, this.EmbodiedAgentId, this.sessionId);
        
        await this.skillManager.startObservationSkills(this.sessionId, this.EmbodiedAgentId);
    }

    public startCLI(): void {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: ''
        });

        this.rl.on('line', async (line) => {
            const text = line.trim();
            if (!text) return;

            if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
                await this.shutdown();
                process.exit(0);
            } else {
                // 發送訊息給主大腦 (MainAgent) 或當前正在投影的軀殼
                const targetId = this.EmbodiedAgentId;
                
                const messageBlock = new messaging.DataBlock({
                    sessionId: this.sessionId,
                    senderId: 'USER',
                    targetId: targetId,
                    type: 'human',
                    intent: 'USER_INPUT',
                    controlPayload: text
                });

                // 透過標準的 AgentMessage 頻道廣播
                this.eventBus.publish({
                    type: messaging.AgentEvent.AgentMessage,
                    timestamp: Date.now(),
                    sessionId: this.sessionId,
                    payload: messageBlock
                });
            }
        });

        // 訂閱全局 AgentMessage 來接收 MainAgent 的回覆
        this.eventBus.subscribe(AgentEvent.AgentMessage, (event: IEvent<AgentEvent.AgentMessage>) => {
            const payload = event.payload as any;
            const blocks = Array.isArray(payload) ? payload : [payload];
            for (const dataBlock of blocks) {
                if (dataBlock && dataBlock.senderId !== 'USER') {
                    console.log(`\n[${dataBlock.senderId} -> ${dataBlock.targetId || 'NONE'}]:\n${dataBlock.toMarkdown ? dataBlock.toMarkdown() : JSON.stringify(dataBlock.controlPayload)}`);
                }
            }
        });
    }

    public async shutdown(): Promise<void> {
        console.log('\n系統關閉中...');
        if (this.rl) {
            this.rl.close();
        }
        if (this.skillManager) {
            this.skillManager.stopAll();
        }
        if (this.botManager) {
            await this.botManager.stop();
        }
        if (this.kernel) {
            await this.kernel.stop();
        }
    }

    private setupProcessEvents(): void {
        const exitHandler = async () => {
            await this.shutdown();
            process.exit(0);
        };

        process.on('SIGINT', exitHandler);
        process.on('SIGTERM', exitHandler);
    }
}
