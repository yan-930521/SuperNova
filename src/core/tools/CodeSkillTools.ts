import { z } from 'zod';
import * as path from 'path';

import { BaseTool, ToolContext } from './BaseTool';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { CodeSkillEntity, ICodeSkillRepository } from '../domain/ICodeSkillRepository';

/**
 * 工具：撰寫 CodeSkill
 * 讓 Agent 能自定義行為腳本，並寫入其專屬 Workspace 中。
 * 同時會將技能的 Metadata 寫入 skills_index.json 以供管理。
 */
export class CreateCodeSkillTool extends BaseTool {
    public readonly name = 'create_code_skill';
    public readonly description = 'Create a new TypeScript CodeSkill and save it to your local workspace. Ensure your code extends ActionSkill or ObservationSkill and implements the required methods.';
    public readonly schema = z.object({
        skillName: z.string().describe('The name of the skill, e.g., GatherWoodSkill. Will be used as the filename without .ts'),
        description: z.string().describe('A brief description of what this skill does, helping the agent to know when to use it.'),
        code: z.string().describe('The complete TypeScript code for the skill. Must default export the class.'),
    });

    constructor(private codeSkillRepo: ICodeSkillRepository) {
        super();
    }

    public async execute(args: { skillName: string, description: string, code: string }, context: ToolContext): Promise<string> {
        try {
            // 嘗試取得現有技能以保留歷史數據
            const existingSkill = await this.codeSkillRepo.getSkill(context.sessionId, context.agentId, args.skillName);
            
            const skillEntity: CodeSkillEntity = {
                id: args.skillName,
                description: args.description,
                timestamp: Date.now(),
                usageStats: existingSkill?.usageStats || {
                    executionCount: 0,
                    successCount: 0,
                    failureCount: 0,
                    successRate: 0,
                    lossRate: 0,
                    averageDurationMs: 0
                }
            };
            
            await this.codeSkillRepo.saveSkill(context.sessionId, context.agentId, skillEntity, args.code);
            
            return `Successfully created CodeSkill ${args.skillName}. It has been registered in the skills index.`;
        } catch (error: any) {
            return `Failed to create CodeSkill: ${error.message}`;
        }
    }
}

/**
 * 工具：執行 CodeSkill
 * 動態載入 Workspace 中的 .ts 技能檔案並執行，並記錄執行數據。
 */
export class ExecuteCodeSkillTool extends BaseTool {
    public readonly name = 'execute_code_skill';
    public readonly description = 'Dynamically load and execute a previously created CodeSkill. If it fails, you will receive the error message and stack trace to help you fix it.';
    public readonly schema = z.object({
        skillName: z.string().describe('The name of the skill to execute (without .ts extension).'),
        args: z.any().optional().describe('Optional arguments to pass to the execute() method.'),
    });

    constructor(
        private workspaceManager: IWorkspaceManager,
        private codeSkillRepo: ICodeSkillRepository,
        private getCodeSkillContext: (agentId: string) => any
    ) {
        super();
    }

    public async execute(args: { skillName: string, args?: any }, context: ToolContext): Promise<string> {
        const startTime = Date.now();
        let isSuccess = false;
        let errorMessage = '';

        try {
            const workspacePath = await this.workspaceManager.getWorkspacePath(context.sessionId, context.agentId);
            const filePath = path.join(workspacePath, 'skills', `${args.skillName}.ts`);
            
            const module = await import(`${filePath}?t=${Date.now()}`);
            
            const SkillClass = module.default;
            if (!SkillClass) {
                throw new Error(`The skill file must use "export default class ${args.skillName} extends ActionSkill"`);
            }

            const skillContext = this.getCodeSkillContext(context.agentId);
            const skillInstance = new SkillClass(skillContext);
            
            const result = await skillInstance.execute(args.args);
            isSuccess = true;
            
            // 記錄統計資訊
            await this.codeSkillRepo.recordExecution(context.sessionId, context.agentId, args.skillName, isSuccess, Date.now() - startTime);
            
            return `Execution successful. Result: ${JSON.stringify(result)}`;
            
        } catch (error: any) {
            isSuccess = false;
            errorMessage = error.message;
            // 記錄統計資訊
            try {
                await this.codeSkillRepo.recordExecution(context.sessionId, context.agentId, args.skillName, isSuccess, Date.now() - startTime);
            } catch (e) {
                // Ignore analytics update failure
            }
            
            return `CodeSkill Execution Error:\n${errorMessage}\n${error.stack}`;
        }
    }
}
