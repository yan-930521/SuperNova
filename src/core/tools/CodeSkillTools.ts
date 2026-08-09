import * as path from 'path';
import { z } from 'zod';

import { CodeSkillEntity, ICodeSkillRepository } from '../domain/ICodeSkillRepository';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { CodeSkillContext } from '../skill/BaseSkill';
import { BaseTool, ToolContext } from './BaseTool';

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
            const versionId = await this.codeSkillRepo.saveSkill(
                context.sessionId,
                context.agentId,
                args.skillName,
                args.description,
                args.code
            );
            return `Successfully created CodeSkill ${args.skillName} (Version: ${versionId}). It has been registered in the skills index.`;
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
        args: z.any().nullable().describe('Optional arguments to pass to the execute() method.'),
    });

    constructor(
        private workspaceManager: IWorkspaceManager,
        private codeSkillRepo: ICodeSkillRepository,
        private getCodeSkillContext: (agentId: string) => CodeSkillContext
    ) {
        super();
    }

    public async execute(args: { skillName: string, args?: any }, context: ToolContext): Promise<string> {
        const startTime = Date.now();
        let isSuccess = false;
        let errorMessage = '';

        try {
            const filePath = await this.codeSkillRepo.getSkillFilePath(context.sessionId, context.agentId, args.skillName);
            
            const module = await import(`${filePath}?t=${Date.now()}`);
            
            const SkillClass = module.default;
            if (!SkillClass) {
                return `Error: The skill file must use "export default class ${args.skillName} extends ActionSkill"`;
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

export class ReadCodeSkillTool extends BaseTool {
    public readonly name = 'read_code_skill';
    public readonly description = 'Read the TypeScript source code of a specific skill. Essential before trying to fix or update a skill.';
    public readonly schema = z.object({
        skillName: z.string().describe('The name of the skill, e.g., GatherWoodSkill.'),
        versionId: z.string().nullable().describe('Optional. The specific version ID to read. If omitted, reads the current version.')
    });

    constructor(private codeSkillRepo: ICodeSkillRepository) {
        super();
    }

    public async execute(args: { skillName: string, versionId?: string }, context: ToolContext): Promise<string> {
        try {
            const code = await this.codeSkillRepo.getSkillCode(context.sessionId, context.agentId, args.skillName, args.versionId);
            return `Source code for ${args.skillName} (Version: ${args.versionId || 'current'}):\n\n\`\`\`typescript\n${code}\n\`\`\``;
        } catch (error: any) {
            return `Failed to read code skill: ${error.message}`;
        }
    }
}

export class RollbackCodeSkillTool extends BaseTool {
    public readonly name = 'rollback_code_skill';
    public readonly description = 'Rollback a broken skill to a previous stable version.';
    public readonly schema = z.object({
        skillName: z.string().describe('The name of the skill.'),
        versionId: z.string().nullable().describe('Optional. The specific version ID to rollback to. If omitted, it will auto-select the best historical version based on success rate.')
    });

    constructor(private codeSkillRepo: ICodeSkillRepository) {
        super();
    }

    public async execute(args: { skillName: string, versionId?: string }, context: ToolContext): Promise<string> {
        try {
            await this.codeSkillRepo.rollbackSkill(context.sessionId, context.agentId, args.skillName, args.versionId);
            return `Successfully rolled back CodeSkill ${args.skillName}.`;
        } catch (error: any) {
            return `Failed to rollback code skill: ${error.message}`;
        }
    }
}

export class ListSkillVersionsTool extends BaseTool {
    public readonly name = 'list_skill_versions';
    public readonly description = 'List all historical versions of a skill and their usage statistics (success rate, execution count, etc.).';
    public readonly schema = z.object({
        skillName: z.string().describe('The name of the skill.')
    });

    constructor(private codeSkillRepo: ICodeSkillRepository) {
        super();
    }

    public async execute(args: { skillName: string }, context: ToolContext): Promise<string> {
        try {
            const skill = await this.codeSkillRepo.getSkill(context.sessionId, context.agentId, args.skillName);
            if (!skill) return `Skill ${args.skillName} not found.`;

            let output = `Versions for ${args.skillName} (Current: ${skill.currentVersionId}):\n`;
            for (const [vId, vData] of Object.entries(skill.versions)) {
                const stats = vData.usageStats;
                output += `- ${vId}: ${stats.executionCount} runs, ${(stats.successRate * 100).toFixed(1)}% success, ${(stats.lossRate * 100).toFixed(1)}% loss, ${Math.round(stats.averageDurationMs)}ms avg\n`;
            }
            return output;
        } catch (error: any) {
            return `Failed to list versions: ${error.message}`;
        }
    }
}

export class DeleteCodeSkillTool extends BaseTool {
    public readonly name = 'delete_code_skill';
    public readonly description = 'Delete a obsolete or unused skill from the agent memory completely.';
    public readonly schema = z.object({
        skillName: z.string().describe('The name of the skill.')
    });

    constructor(private codeSkillRepo: ICodeSkillRepository) {
        super();
    }

    public async execute(args: { skillName: string }, context: ToolContext): Promise<string> {
        try {
            await this.codeSkillRepo.deleteSkill(context.sessionId, context.agentId, args.skillName);
            return `Successfully deleted CodeSkill ${args.skillName}.`;
        } catch (error: any) {
            return `Failed to delete code skill: ${error.message}`;
        }
    }
}
