import { ITaskManager } from '../domain/ITask';
import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { LLMProvider } from '../infra/llm/LLMProvider';
import {
    SendMessageTool, SpawnAgentTool, TerminateSelfTool, ToggleProjectionTool
} from './AgentTools';
import { BaseTool } from './BaseTool';
import { CheckTaskDashboardTool, PlanTasksTool, StrategizeAndPlanTool } from './TaskTools';
import {
    ListFilesTool, ReadBlobTool, ReadFileTool, RunBashTool, WriteFileTool
} from './WorkspaceTools';

import type { AgentManager } from '../agent/AgentManager';
export class ToolRegistry {
    private readonly tools: Map<string, BaseTool> = new Map();

    constructor(
        workspaceManager: IWorkspaceManager,
        agentManager: AgentManager,
        taskManager: ITaskManager,
        llmProvider: LLMProvider
    ) {
        // Workspace Tools
        this.register(new ReadFileTool(workspaceManager));
        this.register(new WriteFileTool(workspaceManager));
        this.register(new ListFilesTool(workspaceManager));
        this.register(new RunBashTool(workspaceManager));
        this.register(new ReadBlobTool(workspaceManager));

        // Agent Tools
        this.register(new SendMessageTool());
        this.register(new ToggleProjectionTool());
        this.register(new SpawnAgentTool(agentManager));
        this.register(new TerminateSelfTool(agentManager));

        // Task Tools
        this.register(new PlanTasksTool(taskManager));
        this.register(new CheckTaskDashboardTool(taskManager));
        this.register(new StrategizeAndPlanTool(taskManager, llmProvider));
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
                console.warn(`[ToolRegistry] Tool '${name}' not found.`);
            }
        }
        return result;
    }
}
