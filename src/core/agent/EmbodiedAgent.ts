import * as path from 'path';

import { Config } from '../config/Config';
import { HookEvent, IEventBus, PromptSectionIndex } from '../domain/IBus';
import { IDataBlockRepository } from '../domain/IRepository';
import { EMBODIED_SDK_DECLARATION } from '../skill/EmbodiedSDK';
import { PromptLoader } from '../utils/PromptLoader';
import { AgentOptions, AgentType, BaseAgent, BaseAgentData } from './BaseAgent';
import { StateEntry, StateRegistry } from './StateRegistry';

export interface EmbodiedAgentData extends BaseAgentData {
    dynamicState?: Record<string, StateEntry>;
}

/**
 * EmbodiedAgent
 * 長期存在於特定環境（如虛擬世界或現實機器人）的具身智能實體。
 * 必須被強制注入 Body (形體) 組件。不可隨意分身。
 */
export class EmbodiedAgent extends BaseAgent {
    public readonly type = AgentType.EMBODIED;

    // 動態狀態樹，用於儲存感知與執行期記憶
    public readonly stateRegistry = new StateRegistry();

    constructor(
        id: string,
        sessionId: string,
        options: AgentOptions
    ) {
        super(id, sessionId, options);

        // 從 JSON 設定檔載入 EmbodiedAgent 專屬身份與認知
        if (!this.profile) {
            try {
                const rawContent = PromptLoader.loadProfile('embodied_agent', this.config, '{}');
                const profileData = JSON.parse(rawContent);
                this.setProfile(profileData);
            } catch (error) {
                this.logger.error(`Failed to load embodied_agent.json: ${error}`);
            }
        }
    }

    // 訂閱 BeforeAgentStep Hook 以動態注入 SDK、技能庫與狀態樹
    protected setupHooks(): void {
        this.eventBus.subscribe(HookEvent.BeforeAgentStep, async (event) => {
            const payload = event.payload;
            // 若沒指定 agentId 或指定的不是自己，則不介入
            if (payload.agentId && payload.agentId !== this.id) return;

            if (!payload.injectedPrompts) {
                payload.injectedPrompts = [];
            }

            // 1. 注入 SDK 宣告
            let sdkDeclaration = EMBODIED_SDK_DECLARATION;
            if (this.options.envSdkDeclaration) {
                sdkDeclaration += '\n' + this.options.envSdkDeclaration;
            }

            payload.injectedPrompts.push({
                index: PromptSectionIndex.TACTICAL_GUIDELINE,
                content: `## Embodied CodeSkill SDK\nYou have the ability to write and execute typescript skills. Use the following SDK interfaces:\n\n\`\`\`typescript\n${sdkDeclaration}\n\`\`\``
            });

            // 2. 注入狀態樹
            payload.injectedPrompts.push({
                index: PromptSectionIndex.ENVIRONMENT_STATE,
                content: `## Dynamic Self State\n${this.stateRegistry.exportSummary()}`
            });

            // 3. 注入已有的技能清單 (讀取 JSON 管理檔)
            try {
                const skills = await this.options.codeSkillRepo.listSkills(this.sessionId, this.id);
                
                const availableSkills = skills.map(skill => {
                    const currentVersion = skill.versions[skill.currentVersionId];
                    const stats = currentVersion?.usageStats;
                    const statsStr = stats ? ` (Version: ${skill.currentVersionId}, Runs: ${stats.executionCount}, Success Rate: ${(stats.successRate * 100).toFixed(1)}%, AvgTime: ${Math.round(stats.averageDurationMs)}ms)` : '';
                    return `- ${skill.id}${statsStr}: ${skill.description}`;
                });
                
                if (availableSkills.length > 0) {
                    payload.injectedPrompts.push({
                        index: PromptSectionIndex.TACTICAL_GUIDELINE,
                        content: `## Available CodeSkills\nThe following skills are already saved in your workspace and can be executed via execute_code_skill:\n${availableSkills.join('\n')}`
                    });
                }
            } catch (e) {
                // 目錄或 index 檔可能尚未建立，略過
            }
        })
    }

    public serialize(): EmbodiedAgentData {
        const baseData = super.serialize();
        return {
            ...baseData,
            dynamicState: this.stateRegistry.serialize()
        };
    }

    public hydrate(data: EmbodiedAgentData): void {
        super.hydrate(data);
        if (data.dynamicState) {
            this.stateRegistry.hydrate(data.dynamicState);
        }
    }
}
