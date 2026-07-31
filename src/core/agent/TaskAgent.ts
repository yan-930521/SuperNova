import { Config } from '../config/Config';
import { IDataBlockRepository } from '../infra/persistence/IRepository';
import { HookEvent, IEventBus, PromptSectionIndex } from '../messaging/IBus';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentOptions, AgentType, BaseAgent } from './BaseAgent';

/**
 * TaskAgent (左腦邏輯核心 / Left Brain)
 * 為解決特定任務動態生成的邏輯控制單元。
 * 負責程式碼編寫、IDE 控制、除錯與嚴謹的 PDCA 循環。
 */
export class TaskAgent extends BaseAgent {
    public readonly type = AgentType.TASK;
    public readonly canClone = true;

    constructor(
        id: string,
        sessionId: string,
        eventBus: IEventBus,
        config: Config,
        dataBlockRepo: IDataBlockRepository,
        options?: AgentOptions
    ) {
        super(id, sessionId, eventBus, config, dataBlockRepo, options);

        // 如果沒有被指派 profile (例如是 Clone)，則載入預設的左腦設定
        if (!this.profile) {
            try {
                const rawContent = PromptLoader.loadProfile('v1/task_agent', this.config, '{}');
                const profileData = JSON.parse(rawContent);
                this.setProfile(profileData);
            } catch (error) {
                this.logger.error(`Failed to load task_agent.json: ${error}`);
            }
        }
    }

    protected setupHooks(): void {
        // 動態注入 Left Brain 專屬的認知約束
        this.eventBus.subscribe(HookEvent.BeforeAgentStep, async (event) => {
            if (event.payload.agentId === this.id) {
                const guideline = `## LEFT BRAIN TACTICAL GUIDELINE
You are the Tactical Left Brain. You are highly logical, analytical, and focused on problem-solving.
Your primary domain is interacting with the IDE, writing code, debugging, and executing commands.
Do not simulate emotions or casual conversation. Maintain strict professionalism and precision.`;

                if (!event.payload.injectedPrompts) event.payload.injectedPrompts = [];
                event.payload.injectedPrompts.push({
                    index: PromptSectionIndex.TACTICAL_GUIDELINE,
                    content: guideline
                });
            }
        }, { sessionId: this.sessionId });
    }
}
