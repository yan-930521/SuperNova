import { EmbodiedAgent } from '@core/agent';
import { ICodeSkillRepository } from '@core/domain/ICodeSkillRepository';
import { ITaskManager, ITaskPlanningService } from '@core/domain/ITask';
import { IWorkspaceManager } from '@core/domain/IWorkspaceManager';
import { LogManager } from '@core/infra';
import { ConsoleTransport } from '@core/infra/transports';

import {
    AssignTaskTool, SendMessageTool, SpawnAgentTool, ToggleProjectionTool, UpdateTaskStatusTool
} from './AgentTools';
import { BaseTool } from './BaseTool';
import {
    CreateCodeSkillTool, DeleteCodeSkillTool, ExecuteCodeSkillTool, ListSkillVersionsTool,
    ReadCodeSkillTool, RollbackCodeSkillTool
} from './CodeSkillTools';
import { ReadUrlContentTool, SearchWebTool } from './ResearchTools';
import { PlanTasksTool, StrategizeAndPlanTool } from './TaskTools';
import {
    ListFilesTool, ReadBlobTool, ReadFileTool, RunBashTool, WriteFileTool
} from './WorkspaceTools';

import type { AgentManager } from '../agent/AgentManager';
export class ToolRegistry {
    private readonly logger = new LogManager({ type: 'SYSTEM', name: 'ToolRegistry' }).addTransport(new ConsoleTransport('DEBUG'));
    private readonly tools: Map<string, BaseTool> = new Map();

    constructor(
        workspaceManager: IWorkspaceManager,
        agentManager: AgentManager,
        taskManager: ITaskManager,
        codeSkillRepo: ICodeSkillRepository,
        taskPlanningService: ITaskPlanningService
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

        // Agent Tools
        this.register(new SendMessageTool());
        this.register(new ToggleProjectionTool());
        this.register(new SpawnAgentTool(agentManager));
        this.register(new AssignTaskTool(taskManager, agentManager));
        this.register(new UpdateTaskStatusTool(agentManager, taskManager));

        // Task Tools
        this.register(new PlanTasksTool(taskManager));
        this.register(new StrategizeAndPlanTool(taskPlanningService));

        // Research Tools
        this.register(new SearchWebTool());
        this.register(new ReadUrlContentTool());
    }

    public register(tool: BaseTool) {
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
                this.logger.warn(`Tool '${name}' not found.`);
            }
        }
        return result;
    }
}
