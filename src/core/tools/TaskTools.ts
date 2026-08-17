import { z } from 'zod';

import { ITaskManager, ITaskPlanningService } from '../domain/ITask';
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
            const tasksWithCreator = args.tasks.map((t: any) => ({ ...t, creatorId: context.agentId }));
            this.taskManager.addTasks(context.sessionId, tasksWithCreator);
            return `Successfully added ${args.tasks.length} tasks to the DAG. Use assign_task to assign tasks.`;
        } catch (e: any) {
            return `Failed to plan tasks: ${e.message}`;
        }
    }
}


export class StrategizeAndPlanTool extends BaseTool {
    public readonly name = 'strategize_and_plan';
    public readonly description = 'Given a high-level objective, use LATS (Language Agent Tree Search) to search for the best strategy and automatically translate it into a TaskDAG for execution.';

    public readonly schema = z.object({
        objective: z.string().describe('The ultimate goal or complex task you want to achieve'),
        context: z.string().describe('Any relevant context or background info'),
        use_mcts: z.boolean().default(false).describe('Optional: explicitly enable MCTS/LATS for this specific plan. Only enable this if the task is complex. MUST BE TRUE for strategy_mode, scoring_criteria, and expansion_hint to take effect.'),
        strategy_mode: z.enum(['holistic', 'step_by_step']).default('holistic').describe('Search granularity. "holistic" generates complete strategies per iteration; "step_by_step" deduces and simulates multiple next-step actions. (Requires use_mcts = true)'),
        scoring_criteria: z.string().nullable().describe('Custom evaluation criteria (e.g., "Minimize memory usage", "Focus on scalability", "Ensure user safety").'),
        expansion_hint: z.string().nullable().describe('Hints for the planner on how to explore (e.g., "Consider edge cases", "Use design pattern X").')
    });

    constructor(
        private readonly taskPlanningService: ITaskPlanningService
    ) {
        super();
    }

    public async execute(args: any, context: ToolContext): Promise<string> {
        if (!context.sessionId) return "Failed: No active session.";

        const taskConfig = context.config.task;
        const useMcts = taskConfig.force_mcts === true ? true : args.use_mcts ?? false;
        const iterations = taskConfig.mcts_max_iterations;

        this.taskPlanningService.strategizeAndPlanAsync(
            context.sessionId,
            context.agentId,
            args.objective,
            args.context || '',
            useMcts,
            iterations,
            args.strategy_mode,
            args.scoring_criteria,
            args.expansion_hint
        );

        return `Background planning started (Mode: ${args.strategy_mode}) for objective: "${args.objective}". You will receive a System Notification via EventBus when the planning is complete. You can proceed with other tasks or wait for the notification.`;
    }
}

