import { Config } from '../config/Config';
import { IDataBlockRepository } from '../domain/IRepository';
import { HookEvent, IEventBus, PromptSectionIndex } from '../domain/IBus';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentOptions, AgentType, BaseAgent } from './BaseAgent';

/**
 * TaskAgent (左腦邏輯核心 / Left Brain)
 * 為解決特定任務動態生成的邏輯控制單元。
 * 負責程式碼編寫、IDE 控制、除錯與嚴謹的 PDCA 循環。
 */
export class TaskAgent extends BaseAgent {
    public readonly type = AgentType.TASK;

    constructor(
        id: string,
        sessionId: string,
        options: AgentOptions
    ) {
        super(id, sessionId, options);

        // 如果沒有被指派 profile (例如是 Clone)，則載入預設的左腦設定
        if (!this.profile) {
            try {
                const rawContent = PromptLoader.loadProfile('task_agent', this.config, '{}');
                const profileData = JSON.parse(rawContent);
                this.setProfile(profileData);
            } catch (error) {
                this.logger.error(`Failed to load task_agent.json: ${error}`);
            }
        }
    }

    protected setupHooks(): void {
        // 動態注入 Left Brain 專屬的認知約束
        this.subscribeEvent(HookEvent.BeforeAgentStep, async (event) => {
            if (event.payload.agentId === this.id) {
                let guideline = `## LEFT BRAIN TACTICAL GUIDELINE
You are the Tactical Left Brain. You are highly logical, analytical, and focused on problem-solving.
Your primary domain is interacting with the IDE, writing code, debugging, and executing commands.
Do not simulate emotions or casual conversation. Maintain strict professionalism and precision.`;

                if (this.isTemp) {
                    guideline += `\n\n[LIFECYCLE NOTICE]\nYou are a temporary TaskAgent spawned for a specific objective. When you have fully completed your assigned task, you MUST use the send_message tool to report your final results back to the requester, and immediately after that, you MUST use the terminate_self tool to end your lifecycle and free up system resources.`;
                }

                if (!event.payload.injectedPrompts) event.payload.injectedPrompts = [];
                event.payload.injectedPrompts.push({
                    index: PromptSectionIndex.TACTICAL_GUIDELINE,
                    content: guideline
                });
            }
        }, { sessionId: this.sessionId });
    }
}
