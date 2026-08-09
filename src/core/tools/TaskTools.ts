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

        // MCTS 模式判定優先級：Config 強制開啟 > LLM 傳入參數 > 預設關閉
        // 這段必須在閉包外計算，讓即時回傳與背景任務都能一致地讀取模式標籤
        const taskConfig = context.config.task;
        const useMcts = taskConfig.force_mcts === true ? true : args.use_mcts ?? false;
        const iterations = taskConfig.mcts_max_iterations;
        const modeLabel = useMcts ? 'MCTS/LATS Strategy Search' : 'Direct DAG Generation (No MCTS)';

        const runBackgroundPlanning = async () => {
            try {
                const planner = new LATSPlanner(this.llmProvider);
                const generator = new TaskDAGGenerator(this.llmProvider);

                let strategy: string;
                if (useMcts) {
                    strategy = await planner.search(args.objective, args.context || '', iterations);
                } else {
                    strategy = `Direct Objective: ${args.objective}\nContext: ${args.context || ''}`;
                }

                const tasks = await generator.generate(strategy);
                const tasksWithCreator = tasks.map(t => ({ ...t, creatorId: context.agentId }));
                this.taskManager.addTasks(context.sessionId, tasksWithCreator);

                const report = `[Background Planning Completed (Mode: ${modeLabel})]\nSuccessfully planned ${tasks.length} tasks for objective: "${args.objective}".\n\nStrategy Overview:\n${strategy}\n\nUse assign_task to assign tasks.`;

                const dataBlock = new DataBlock({
                    sessionId: context.sessionId,
                    senderId: 'SYSTEM',
                    targetId: context.agentId,
                    type: 'system',
                    intent: 'BACKGROUND_TASK_COMPLETED',
                    priority: MessagePriority.HIGH,
                    controlPayload: report,
                    metadata: {
                        senderName: 'System'
                    }
                });

                context.eventBus.publish({
                    type: AgentEvent.AgentMessage,
                    timestamp: Date.now(),
                    sessionId: context.sessionId,
                    payload: dataBlock
                });
            } catch (e: any) {
                const errorReport = `[Background Planning Failed (Mode: ${modeLabel})] Error: ${e.message}`;
                const dataBlock = new DataBlock({
                    sessionId: context.sessionId,
                    senderId: 'SYSTEM',
                    targetId: context.agentId,
                    type: 'system',
                    intent: 'BACKGROUND_TASK_FAILED',
                    priority: MessagePriority.URGENT,
                    controlPayload: errorReport,
                    metadata: {
                        senderName: 'System'
                    }
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

        return `Background planning started (Mode: ${modeLabel}) for objective: "${args.objective}". You will receive a System Notification via EventBus when the planning is complete. You can proceed with other tasks or wait for the notification.`;
    }
}
