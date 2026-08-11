import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

import { CodeSkillEntity, ICodeSkillRepository } from '../domain/ICodeSkillRepository';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { CodeSkillContext } from '../skill/BaseSkill';
import { SkillManager } from '../skill/SkillManager';
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

    constructor(
        private codeSkillRepo: ICodeSkillRepository,
        private skillManager?: SkillManager
    ) {
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
            if (this.skillManager) {
                this.skillManager.invalidateCache(context.sessionId, context.agentId, args.skillName);
            }
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
    public readonly description = 'Execute an existing CodeSkill from the repository. Arguments must be provided as a JSON string matching the skill schema.';
    public readonly schema = z.object({
        skillId: z.string().describe('The ID (filename without .ts) of the skill to execute.'),
        args: z.any().nullable().describe('Optional arguments to pass to the execute() method.')
    });

    constructor(
        private workspaceManager: IWorkspaceManager,
        private skillManager: SkillManager
    ) {
        super();
    }

    public async execute(args: { skillId: string, args?: any }, context: ToolContext): Promise<string> {
        try {
            const result = await this.skillManager.executeSkill(context.sessionId, context.agentId, args.skillId, args.args);
            return `Execution successful. Result: ${JSON.stringify(result)}`;
        } catch (error: any) {
            return `Execution Error:\n${error.message}\n${error.stack}`;
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

    constructor(
        private codeSkillRepo: ICodeSkillRepository,
        private skillManager?: SkillManager
    ) {
        super();
    }

    public async execute(args: { skillName: string, versionId?: string }, context: ToolContext): Promise<string> {
        try {
            await this.codeSkillRepo.rollbackSkill(context.sessionId, context.agentId, args.skillName, args.versionId);
            if (this.skillManager) {
                this.skillManager.invalidateCache(context.sessionId, context.agentId, args.skillName);
            }
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
    public readonly description = 'Delete an obsolete or unused skill completely, or delete a specific version of a skill.';
    public readonly schema = z.object({
        skillName: z.string().describe('The name of the skill.'),
        versionId: z.string().nullable().describe('Optional. The specific version ID to delete. If omitted, the entire skill and all its versions are deleted.')
    });

    constructor(
        private codeSkillRepo: ICodeSkillRepository,
        private skillManager?: SkillManager
    ) {
        super();
    }

    public async execute(args: { skillName: string, versionId?: string }, context: ToolContext): Promise<string> {
        try {
            if (args.versionId) {
                await this.codeSkillRepo.deleteSkillVersion(context.sessionId, context.agentId, args.skillName, args.versionId);
                return `Successfully deleted version ${args.versionId} of CodeSkill ${args.skillName}.`;
            } else {
                await this.codeSkillRepo.deleteSkill(context.sessionId, context.agentId, args.skillName);
                if (this.skillManager) {
                    this.skillManager.invalidateCache(context.sessionId, context.agentId, args.skillName);
                }
                return `Successfully deleted CodeSkill ${args.skillName} entirely.`;
            }
        } catch (error: any) {
            return `Failed to delete code skill: ${error.message}`;
        }
    }
}

export class TestCodeSkillTool extends BaseTool {
    public readonly name = 'test_code_skill';
    public readonly description = 'Dynamically create a temporary TypeScript script and run type-checking (tsc --noEmit) on it to catch syntax or typing errors before saving it.';
    public readonly schema = z.object({
        code: z.string().describe('The complete TypeScript code to type-check.'),
    });

    constructor(
        private workspaceManager: IWorkspaceManager
    ) {
        super();
    }

    public async execute(args: { code: string }, context: ToolContext): Promise<string> {
        try {
            const tempFileName = `temp_skill_${Date.now()}_${Math.floor(Math.random() * 1000)}.ts`;
            const workspacePath = await this.workspaceManager.getWorkspacePath(context.sessionId, context.agentId) || process.cwd();
            const finalPath = path.join(workspacePath, tempFileName);
            
            await fs.writeFile(finalPath, args.code, 'utf-8');
            
            // 使用 workspaceManager.runBash 執行 tsc --noEmit 來進行靜態型別檢查
            const runResult = await this.workspaceManager.runBash(context.sessionId, context.agentId, `bun x tsc --noEmit ${tempFileName}`);
            
            // 清理暫存檔
            await fs.unlink(finalPath).catch(() => {});
            
            if (runResult.exitCode === 0) {
                return `Type Check Passed! The code has no syntax or typing errors.\nSTDOUT:\n${runResult.stdout}`;
            } else {
                return `Type Check Failed (Exit Code: ${runResult.exitCode}).\nSTDOUT:\n${runResult.stdout}\nSTDERR:\n${runResult.stderr}`;
            }
        } catch (error: any) {
            return `Type Check Error: ${error.message}`;
        }
    }
}
