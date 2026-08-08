import { z } from 'zod';

import { AgentEvent } from '../domain/IBus';
import { ITaskManager } from '../domain/ITask';
import { LLMProvider } from '../infra/llm/LLMProvider';
import { DataBlock, MessagePriority } from '../messaging/DataBlock';
import { LATSPlanner } from '../task/planning/LATSPlanner';
import { TaskDAGGenerator } from '../task/planning/TaskDAGGenerator';
import { BaseTool, ToolContext } from './BaseTool';

export class PlanTasksTool extends BaseTool {
    public readonly name = 'plan_tasks';
    public readonly description = 'Declare a Directed Acyclic Graph (DAG) of tasks. The system will track these tasks and ensure they are executed in topological order based on dependencies. Note: You must still manually use spawn_agent to execute a task when its status becomes READY.';
    
    public readonly schema = z.object({
        tasks: z.array(z.object({
            id: z.string().describe('Unique ID for the task, e.g. "fetch_data"'),
            objective: z.string().describe('Clear instructions for the agent executing this task'),
            dependencies: z.array(z.string()).describe('List of task IDs that must complete before this one starts')
        }))
    });

    constructor(private readonly taskManager: ITaskManager) {
        super();
    }

    public async execute(args: any, context: ToolContext): Promise<string> {
        if (!context.sessionId) return "Failed: No active session.";
        try {
            this.taskManager.addTasks(context.sessionId, args.tasks);
            return `Successfully added ${args.tasks.length} tasks to the DAG. Use check_task_dashboard to monitor progress, and spawn_agent to assign READY tasks.`;
        } catch (e: any) {
            return `Failed to plan tasks: ${e.message}`;
        }
    }
}

export class CheckTaskDashboardTool extends BaseTool {
    public readonly name = 'check_task_dashboard';
    public readonly description = 'View the current status of all tasks in the DAG.';
    
    public readonly schema = z.object({});

    constructor(private readonly taskManager: ITaskManager) {
        super();
    }

    public async execute(args: any, context: ToolContext): Promise<string> {
        if (!context.sessionId) return "Failed: No active session.";
        const tasks = this.taskManager.getAllTasks(context.sessionId);
        if (tasks.length === 0) {
            return "Task Dashboard is empty.";
        }

        let report = "### Task Dashboard\n\n";
        for (const t of tasks) {
            let icon = '⏳';
            if (t.status === 'READY') icon = '🟢';
            if (t.status === 'IN_PROGRESS') icon = '🚀';
            if (t.status === 'COMPLETED') icon = '✅';
            if (t.status === 'FAILED') icon = '❌';
            if (t.status === 'CANCELED') icon = '🚫';

            report += `- ${icon} **[${t.id}]** (${t.status}) - ${t.objective}\n`;
            if (t.dependencies.length > 0) {
                report += `  - Depends on: ${t.dependencies.join(', ')}\n`;
            }
            if (t.assignedAgentId) {
                report += `  - Assigned to: ${t.assignedAgentId}\n`;
            }
            if (t.result) {
                report += `  - Result: ${t.result}\n`;
            }
        }

        return report;
    }
}

export class StrategizeAndPlanTool extends BaseTool {
    public readonly name = 'strategize_and_plan';
    public readonly description = 'Given a high-level objective, use LATS (Language Agent Tree Search) to search for the best strategy and automatically translate it into a TaskDAG for execution.';

    public readonly schema = z.object({
        objective: z.string().describe('The ultimate goal or complex task you want to achieve'),
        context: z.string().describe('Any relevant context or background info'),
        use_mcts: z.boolean().default(false).describe('Optional: explicitly enable MCTS/LATS for this specific plan. Only enable this if the task is complex. If specified, it will NOT be overridden by the system config.')
    });

    constructor(
        private readonly taskManager: ITaskManager,
        private readonly llmProvider: LLMProvider
    ) {
        super();
    }

    public async execute(args: any, context: ToolContext): Promise<string> {
        if (!context.sessionId) return "Failed: No active session.";
        
        const runBackgroundPlanning = async () => {
            try {
                const planner = new LATSPlanner(this.llmProvider);
                const generator = new TaskDAGGenerator(this.llmProvider);
                
                const taskConfig = context.config.task;
                const useMcts = args.use_mcts !== undefined ? args.use_mcts : taskConfig.force_mcts;
                const iterations = taskConfig.mcts_max_iterations;
                
                let strategy: string;
                if (useMcts) {
                    strategy = await planner.search(args.objective, args.context || '', iterations);
                } else {
                    strategy = `Direct Objective: ${args.objective}\nContext: ${args.context || ''}`;
                }
                
                const tasks = await generator.generate(strategy);
                this.taskManager.addTasks(context.sessionId, tasks);
                
                const report = `[LATS Background Planning Completed]\nSuccessfully strategized and planned ${tasks.length} tasks for objective: "${args.objective}".\n\nStrategy Overview:\n${strategy}\n\nUse check_task_dashboard to monitor the DAG.`;
                
                const dataBlock = new DataBlock({
                    sessionId: context.sessionId,
                    senderId: 'SYSTEM',
                    targetId: context.agentId,
                    type: 'system',
                    intent: 'BACKGROUND_TASK_COMPLETED',
                    priority: MessagePriority.HIGH,
                    controlPayload: report
                });

                context.eventBus.publish({
                    type: AgentEvent.AgentMessage,
                    timestamp: Date.now(),
                    sessionId: context.sessionId,
                    payload: dataBlock
                });
            } catch (e: any) {
                const errorReport = `[LATS Background Planning Failed] Error: ${e.message}`;
                const dataBlock = new DataBlock({
                    sessionId: context.sessionId,
                    senderId: 'SYSTEM',
                    targetId: context.agentId,
                    type: 'system',
                    intent: 'BACKGROUND_TASK_FAILED',
                    priority: MessagePriority.URGENT,
                    controlPayload: errorReport
                });

                context.eventBus.publish({
                    type: AgentEvent.AgentMessage,
                    timestamp: Date.now(),
                    sessionId: context.sessionId,
                    payload: dataBlock
                });
            }
        };

        runBackgroundPlanning();

        return `LATS Planner has started in the background to strategize for objective: "${args.objective}". You will receive a System Notification via EventBus when the planning is complete. You can proceed with other tasks or wait for the notification.`;
    }
}
