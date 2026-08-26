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

import { MobManager } from '../MobManager';
import { setupAgentEvents } from '../events/agentEvents';
import { setupMobEvents } from '../events/mobEvents';

export class AvatarEnv extends BaseEmbodiedEnv {
    public readonly envId = 'novalink-avatar-env';

    private mobManager!: MobManager;
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
        this.mobManager = new MobManager(this.eventBus);
        await this.mobManager.initialize();
    }

    public async registerAgent(agentId: string, sessionId: string, stateRegistry: any): Promise<void> {
        await super.registerAgent(agentId, sessionId, stateRegistry);

        const getCodeSkillContext = (id: string): CodeSkillContext => {
            const ctx = this.mobManager.getBotContext(id);
            const agentContext = this.registeredAgents.get(id);
            return {
                state: agentContext?.stateRegistry,
                eventBus: this.eventBus,
                body: ctx?.bot
            };
        };

        if (!this.skillManager) {
            this.skillManager = new SkillManager(this.codeSkillRepo, getCodeSkillContext);
        }
    }

    public getSdkDeclaration(): string {
        try {
            const dtsPath = path.join(__dirname, '../../novalink/novalink-sdk/NovaLink.d.ts');
            return fs.existsSync(dtsPath) ? fs.readFileSync(dtsPath, 'utf-8') : '';
        } catch (e) {
            console.warn('Failed to load SDK declarations', e);
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
            console.warn('[AvatarEnv] start() called but no agent bound yet.');
            return;
        }

        const firstAgentId = Array.from(this.registeredAgents.keys())[0];
        const firstAgent = this.registeredAgents.get(firstAgentId)!;

        // You should provide the real UUID binded in Minecraft
        const uuid = process.env.MINECRAFT_UUID || '00000000-0000-0000-0000-000000000000';

        const ctx = await this.mobManager.spawnBot(
            uuid,
            firstAgentId,
            firstAgent.sessionId
        );

        setupMobEvents(this.mobManager.rpcClient, this.eventBus, firstAgent.sessionId, firstAgentId, 'shimo-main');
        setupAgentEvents(ctx.bot, this.eventBus, firstAgentId, firstAgent.sessionId);
        
        await this.skillManager.startObservationSkills(firstAgent.sessionId, firstAgentId);
    }

    public async stop(): Promise<void> {
        this.skillManager.stopAll();
        await this.mobManager.stop();
    }
}
