import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import {
    SendMessageTool, SpawnAgentTool, TerminateSelfTool, ToggleProjectionTool
} from './AgentTools';
import { BaseTool } from './BaseTool';
import {
    ListFilesTool, ReadBlobTool, ReadFileTool, RunBashTool, WriteFileTool
} from './WorkspaceTools';

import type { AgentManager } from '../agent/AgentManager';
export class ToolRegistry {
    private readonly tools: Map<string, BaseTool> = new Map();

    constructor(
        workspaceManager: IWorkspaceManager,
        agentManager: AgentManager
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
