import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';

import { BaseTool, ToolContext } from './BaseTool';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';

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

    constructor(private workspaceManager: IWorkspaceManager) {
        super();
    }

    public async execute(args: { skillName: string, description: string, code: string }, context: ToolContext): Promise<string> {
        try {
            // Get the agent's private workspace
            const workspacePath = await this.workspaceManager.getWorkspacePath(context.sessionId, context.agentId);
            const skillsDir = path.join(workspacePath, 'skills');
            
            await fs.mkdir(skillsDir, { recursive: true });
            
            // 寫入 TS 執行檔
            const filePath = path.join(skillsDir, `${args.skillName}.ts`);
            await fs.writeFile(filePath, args.code, 'utf-8');
            
            // 寫入/更新 JSON 資源索引
            const indexPath = path.join(skillsDir, 'skills_index.json');
            let indexData: Record<string, { description: string, updatedAt: number }> = {};
            try {
                const rawIndex = await fs.readFile(indexPath, 'utf-8');
                indexData = JSON.parse(rawIndex);
            } catch (e) {
                // Ignore if not exists
            }
            
            indexData[args.skillName] = {
                description: args.description,
                updatedAt: Date.now()
            };
            
            await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
            
            return `Successfully created CodeSkill ${args.skillName} at ${filePath}. It has been registered in the skills index.`;
        } catch (error: any) {
            return `Failed to create CodeSkill: ${error.message}`;
        }
    }
}

/**
 * 工具：執行 CodeSkill
 * 動態載入 Workspace 中的 .ts 技能檔案並執行。
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
        private getCodeSkillContext: (agentId: string) => any // 依賴注入，避免直接耦合 EmbodiedAgent
    ) {
        super();
    }

    public async execute(args: { skillName: string, args?: any }, context: ToolContext): Promise<string> {
        try {
            const workspacePath = await this.workspaceManager.getWorkspacePath(context.sessionId, context.agentId);
            const filePath = path.join(workspacePath, 'skills', `${args.skillName}.ts`);
            
            // Note: Since we are running in Bun, we can dynamically import .ts files natively.
            // Using a timestamp query prevents module caching if the file was updated.
            const module = await import(`${filePath}?t=${Date.now()}`);
            
            // We expect the skill class to be the default export
            const SkillClass = module.default;
            if (!SkillClass) {
                return `Error: The skill file must use "export default class ${args.skillName} extends ActionSkill"`;
            }

            const skillContext = this.getCodeSkillContext(context.agentId);
            const skillInstance = new SkillClass(skillContext);
            
            // Execute the skill
            const result = await skillInstance.execute(args.args);
            return `Execution successful. Result: ${JSON.stringify(result)}`;
            
        } catch (error: any) {
            // Provide stack trace so the agent can learn and reflect
            return `CodeSkill Execution Error:\n${error.message}\n${error.stack}`;
        }
    }
}
