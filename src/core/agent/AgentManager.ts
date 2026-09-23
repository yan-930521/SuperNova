import { ILLMProvider } from '@supernova/common/llm/types';
import { LogManager } from '@supernova/common/LogManager';
import { ConsoleTransport } from '@supernova/common/transports';
import { IEventBus } from '@supernova/events/IBus';
import { IKernel, IKernelPlugin } from '@supernova/runtime/kernel';

import { IConfigManager } from '../../../packages/common/src/config';
import { UniversalAgent, UniversalAgentOptions } from './UniversalAgent';

export const DEFAULT_AGENT_MANAGER_NAME = 'agent_manager';

/**
 * AgentManager
 * 實作 IKernelPlugin (extends ILifecycle)，負責：
 * 1. 自動從 Kernel 注入依賴 (LLMProvider, EventBus, ConfigManager)
 * 2. 集中管理並託管所有 UniversalAgent 實例之生命週期
 * 3. 向 Kernel 註冊 'agent_manager' 服務
 */
export class AgentManager implements IKernelPlugin {
    public readonly name = DEFAULT_AGENT_MANAGER_NAME;

    private kernel?: IKernel;
    private eventBus?: IEventBus;
    private llmProvider?: ILLMProvider;
    private configManager?: IConfigManager;

    /** 託管之 Agent 實例池 (agentId -> UniversalAgent) */
    private readonly agents = new Map<string, UniversalAgent>();

    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'AgentManager' }).addTransport(
        new ConsoleTransport('DEBUG')
    );

    /**
     * 安裝外掛時注入宿主內核實例
     */
    public async install(kernel: IKernel): Promise<void> {
        this.kernel = kernel;
    }

    /**
     * 接收 Kernel 依賴並準備運行環境
     */
    public async initialize(): Promise<void> {
        this.logger.info('Initializing AgentPlugin...');

        if (this.kernel) {
            // 從 Kernel 獲取相依核心服務
            if (this.kernel.hasService('events')) {
                this.eventBus = this.kernel.getService<IEventBus>('events');
            }
            if (this.kernel.hasService('llm')) {
                this.llmProvider = this.kernel.getService<ILLMProvider>('llm');
            }
            if (this.kernel.hasService('config')) {
                this.configManager = this.kernel.getService<IConfigManager>('config');
            }
        }

        this.logger.info('AgentPlugin initialized successfully.');
    }

    /**
     * 啟動外掛並啟動所有受託管之 Agent
     */
    public async start(): Promise<void> {
        this.logger.info('Starting AgentPlugin...');
        for (const agent of this.agents.values()) {
            await agent.start();
        }
    }

    /**
     * 優雅停止所有託管之 Agent
     */
    public async stop(): Promise<void> {
        this.logger.info('Stopping AgentPlugin and terminating all active agents...');
        for (const agent of this.agents.values()) {
            try {
                await agent.stop();
            } catch (err) {
                this.logger.error(`Error stopping agent [${agent.id}]: ${String(err)}`);
            }
        }
        this.agents.clear();
        this.logger.info('AgentPlugin stopped.');
    }

    /**
     * 建立並託管一個新的 UniversalAgent 實例
     * @param id Agent 唯一 ID
     * @param options Agent 初始化選項
     */
    public createAgent(id: string, options?: UniversalAgentOptions): UniversalAgent {
        if (this.agents.has(id)) {
            throw new Error(`Agent with ID [${id}] already exists in AgentPlugin`);
        }

        if (!this.eventBus) {
            throw new Error('EventBus is not available in AgentPlugin. Ensure "events" service is registered in Kernel.');
        }

        if (!this.llmProvider) {
            throw new Error('LLMProvider is not available in AgentPlugin. Ensure "llm" service is registered in Kernel.');
        }

        const agent = new UniversalAgent(
            id,
            this.eventBus,
            this.llmProvider,
            {
                config: this.configManager,
                ...options,
            }
        );

        this.agents.set(id, agent);
        this.logger.debug(`Created and registered agent [${id}]`);
        return agent;
    }

    /**
     * 獲取特定 Agent
     */
    public getAgent(id: string): UniversalAgent | undefined {
        return this.agents.get(id);
    }

    /**
     * 獲取所有已註冊的 Agent 實例清單
     */
    public getAllAgents(): UniversalAgent[] {
        return Array.from(this.agents.values());
    }

    /**
     * 銷毀並停止特定 Agent
     */
    public async removeAgent(id: string): Promise<boolean> {
        const agent = this.agents.get(id);
        if (!agent) {
            return false;
        }

        await agent.stop();
        this.agents.delete(id);
        this.logger.debug(`Removed agent [${id}]`);
        return true;
    }
}
