import * as fs from 'fs';
import * as path from 'path';

import { EmbodiedAgent } from '@core/agent';
import { BaseEmbodiedEnv } from '@core/agent/BaseEmbodiedEnv';
import { IEventBus } from '@core/domain/IBus';
import { ICodeSkillRepository } from '@core/domain/ICodeSkillRepository';
import { IWorkspaceManager } from '@core/domain/IWorkspaceManager';
import { CodeSkillContext } from '@core/skill/BaseSkill';
import { SkillManager } from '@core/skill/SkillManager';
import { BaseTool } from '@core/tools/BaseTool';
import {
    CreateCodeSkillTool, DeleteCodeSkillTool, ExecuteCodeSkillTool, ReadCodeSkillTool, RollbackCodeSkillTool, TestCodeSkillTool
} from '@core/tools/CodeSkillTools';

import { BotManager } from '../BotManager';
import { setupAgentEvents } from '../events/agentEvents';
import { setupMineflayerEvents } from '../events/mineflayerEvents';

export class MinecraftEnv extends BaseEmbodiedEnv {
    public readonly envId = 'minecraft-underworld';

    private botManager!: BotManager;
    private workspaceManager!: IWorkspaceManager;

    constructor(
        eventBus: IEventBus,
        codeSkillRepo: ICodeSkillRepository,
        workspaceManager: IWorkspaceManager
    ) {
        super();
        this.eventBus = eventBus;
        this.codeSkillRepo = codeSkillRepo;
        this.workspaceManager = workspaceManager;
    }

    public async initialize(): Promise<void> {
        this.botManager = new BotManager(this.eventBus);
        await this.botManager.initialize();
    }

    public async registerAgent(agentId: string, sessionId: string, stateRegistry: any): Promise<void> {
        await super.registerAgent(agentId, sessionId, stateRegistry);

        const getCodeSkillContext = (id: string): CodeSkillContext => {
            const ctx = this.botManager.getBotContext(id);
            const agentContext = this.registeredAgents.get(id);
            return {
                state: agentContext?.stateRegistry,
                eventBus: this.eventBus,
                env: ctx?.bot
            };
        };

        if (!this.skillManager) {
            this.skillManager = new SkillManager(this.codeSkillRepo, getCodeSkillContext);
        }
    }

    public getSdkDeclaration(): string {
        const filePath = path.join(__dirname, 'SuperNovaBot.d.ts');
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch (e) {
            console.warn('Failed to load SuperNovaBot.d.ts', e);
            return '';
        }
    }

    public getTools(): BaseTool[] {
        return [
            new ExecuteCodeSkillTool(this.workspaceManager, this.skillManager),
            new CreateCodeSkillTool(this.codeSkillRepo, this.skillManager),
            new RollbackCodeSkillTool(this.codeSkillRepo, this.skillManager),
            new DeleteCodeSkillTool(this.codeSkillRepo, this.skillManager),
            new ReadCodeSkillTool(this.codeSkillRepo),
            new TestCodeSkillTool(this.workspaceManager)
        ];
    }

    public async start(): Promise<void> {
        if (this.registeredAgents.size === 0) {
            console.warn('[MinecraftEnv] start() called but no agent bound yet.');
            return;
        }

        // 假設只示範其中一個 Agent 的啟動
        const firstAgentId = Array.from(this.registeredAgents.keys())[0];
        const firstAgent = this.registeredAgents.get(firstAgentId)!;

        // Here we could start the Bot connection
        const host = process.env.MINECRAFT_HOST || '127.0.0.1';
        const port = parseInt(process.env.MINECRAFT_PORT || '25565', 10);
        const username = process.env.MINECRAFT_USERNAME || 'SuperNovaBot';

        const ctx = await this.botManager.spawnBot(
            host,
            port,
            username,
            firstAgentId,
            firstAgent.sessionId
        );

        // Assume MainAgent is 'shimo-main' for now, this could be passed in config
        setupMineflayerEvents(ctx.bot.core, this.eventBus, firstAgent.sessionId, firstAgentId, 'shimo-main');
        setupAgentEvents(ctx.bot.core, this.eventBus, firstAgentId, firstAgent.sessionId);
        
        await this.skillManager.startObservationSkills(firstAgent.sessionId, firstAgentId);
    }

    public async stop(): Promise<void> {
        this.skillManager.stopAll();
        await this.botManager.stop();
    }
}
