import * as readline from 'readline';

import { EmbodiedAgent } from '@core/agent';
import { AgentEvent, IEvent } from '@core/domain/IBus';
import { ICodeSkillRepository } from '@core/domain/ICodeSkillRepository';
import { LogManager } from '@core/infra';
import { ConsoleTransport } from '@core/infra/transports';
import { CodeSkillContext, ObservationSkill } from '@core/skill/BaseSkill';
import { SkillManager } from '@core/skill/SkillManager';

import { agent, config, lifecycle, messaging, session } from '../../core';
import {
    CreateCodeSkillTool, DeleteCodeSkillTool, ExecuteCodeSkillTool, ReadCodeSkillTool,
    RollbackCodeSkillTool, TestCodeSkillTool
} from '../../core/tools/CodeSkillTools';
import { AvatarEnv } from './wrapper/AvatarEnv';
import { seedSkills } from './wrapper/SkillSeeder';

export class UnderworldApplication {
    private kernel!: lifecycle.RuntimeKernel;
    private eventBus!: messaging.EventBus;
    private agentManager!: agent.AgentManager;
    private sessionManager!: session.SessionManager;
    private codeSkillRepo!: ICodeSkillRepository;
    private avatarEnv!: AvatarEnv;
    private rl?: readline.Interface;

    private readonly MainAgentId = 'shimo-main';
    private readonly EmbodiedAgentId = 'minecraft-bot-01';
    private readonly sessionId = 'underworld-session';

    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'UnderworldApplication' }).addTransport(new ConsoleTransport('DEBUG'));

    public async bootstrap(): Promise<void> {
        this.logger.info('=============================================');
        this.logger.info('   SuperNova Minecraft Underworld Node');
        this.logger.info('=============================================');

        this.kernel = new lifecycle.RuntimeKernel(config.DEFAULT_CONFIG);
        await this.kernel.initialize();
        await this.kernel.start();

        const container = this.kernel.getContainer();
        this.eventBus = container.resolve<messaging.EventBus>('EventBus');
        this.agentManager = container.resolve<agent.AgentManager>('AgentManager');
        this.sessionManager = container.resolve<session.SessionManager>('SessionManager');
        this.codeSkillRepo = container.resolve<ICodeSkillRepository>('ICodeSkillRepository');
        
        const workspaceManager = container.resolve<any>('IWorkspaceManager');
        this.avatarEnv = new AvatarEnv(this.eventBus, this.codeSkillRepo, workspaceManager);
        await this.avatarEnv.initialize();

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

                // 手動生成右腦 (EmbodiedAgent) 並註冊到同一個 Session 中
                await this.agentManager.spawnAgent(agent.AgentType.EMBODIED, this.EmbodiedAgentId, this.sessionId, {});
                
                
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
        const toolRegistry = this.agentManager.getToolRegistry();

        // 1. 取得剛建立的 Right Brain (EmbodiedAgent) 進行配置
        const mcAgent = await this.agentManager.rehydrate(this.EmbodiedAgentId, this.sessionId) as EmbodiedAgent;
        const embodiedDefaults = this.agentManager.getDefaultTools(agent.AgentType.EMBODIED);
        mcAgent.updateTools(toolRegistry.getTools(embodiedDefaults));
        
        // 將 AvatarEnv 掛載到 Agent 身上
        await mcAgent.mountEnvironment(this.avatarEnv);

        // 3. 取得 MainAgent 進行配置
        const mainAgent = await this.agentManager.rehydrate(this.MainAgentId, this.sessionId);
        const mainDefaults = this.agentManager.getDefaultTools(agent.AgentType.MAIN);
        mainAgent.updateTools(toolRegistry.getTools(mainDefaults));

        console.log(`[系統] 完成代理配置。目前啟動代理數量: 2`);
    }

    public async startMinecraftBot(): Promise<void> {
        // Seeding skills (Should happen before observation or during it, depending on logic)
        await seedSkills(this.codeSkillRepo, this.sessionId, this.EmbodiedAgentId);
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
        if (this.avatarEnv) {
            await this.avatarEnv.stop();
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
