import { ITaskManager } from '../domain/ITask';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { LogManager } from '../infra';
import { LLMProvider } from '../infra/llm/LLMProvider';
import {
    AssignTaskTool, SendMessageTool, SpawnAgentTool, ToggleProjectionTool, UpdateTaskStatusTool
} from './AgentTools';
import { BaseTool } from './BaseTool';
import { ReadUrlContentTool, SearchWebTool } from './ResearchTools';
import { PlanTasksTool, StrategizeAndPlanTool } from './TaskTools';
import {
    ListFilesTool, ReadBlobTool, ReadFileTool, RunBashTool, WriteFileTool
} from './WorkspaceTools';

import type { AgentManager } from '../agent/AgentManager';
import { CreateCodeSkillTool, ExecuteCodeSkillTool, ReadCodeSkillTool, RollbackCodeSkillTool, ListSkillVersionsTool, DeleteCodeSkillTool } from './CodeSkillTools';
import { ICodeSkillRepository } from '../domain/ICodeSkillRepository';

export class ToolRegistry {
    private readonly tools: Map<string, BaseTool> = new Map();

    constructor(
        workspaceManager: IWorkspaceManager,
        agentManager: AgentManager,
        taskManager: ITaskManager,
        llmProvider: LLMProvider,
        codeSkillRepo: ICodeSkillRepository
    ) {
        // Workspace Tools
        this.register(new ReadFileTool(workspaceManager));
        this.register(new WriteFileTool(workspaceManager));
        this.register(new ListFilesTool(workspaceManager));
        this.register(new RunBashTool(workspaceManager));
        this.register(new ReadBlobTool(workspaceManager));

        // CodeSkill Tools
        this.register(new CreateCodeSkillTool(codeSkillRepo));
        this.register(new ReadCodeSkillTool(codeSkillRepo));
        this.register(new RollbackCodeSkillTool(codeSkillRepo));
        this.register(new ListSkillVersionsTool(codeSkillRepo));
        this.register(new DeleteCodeSkillTool(codeSkillRepo));
        // 注意：ExecuteCodeSkillTool 依賴第三個參數 callback，需使用 closure 來避免循環依賴
        this.register(new ExecuteCodeSkillTool(workspaceManager, codeSkillRepo, (agentId: string) => (agentManager.getAgent(agentId) as any)?.stateRegistry));

        // Agent Tools
        this.register(new SendMessageTool());
        this.register(new ToggleProjectionTool());
        this.register(new SpawnAgentTool(agentManager));
        this.register(new AssignTaskTool(taskManager, agentManager));
        this.register(new UpdateTaskStatusTool(agentManager, taskManager));

        // Task Tools
        this.register(new PlanTasksTool(taskManager));
        this.register(new StrategizeAndPlanTool(taskManager, llmProvider));

        // Research Tools
        this.register(new SearchWebTool());
        this.register(new ReadUrlContentTool());
    }

    private register(tool: BaseTool) {
        this.tools.set(tool.name, tool);
    }

    public getTools(names?: string[]): BaseTool[] {
        if (!names) {
            return Array.from(this.tools.values());
        }

        const result: BaseTool[] = [];
        for (const name of names) {
            const tool = this.tools.get(name);
            if (tool) {
                result.push(tool);
            } else {
                LogManager.recorder.warn(`[ToolRegistry] Tool '${name}' not found.`);
            }
        }
        return result;
    }
}
