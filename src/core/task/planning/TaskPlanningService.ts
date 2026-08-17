import { AgentEvent, IEventBus } from '../../domain/IBus';
import { ITaskManager, ITaskPlanningService } from '../../domain/ITask';
import { LLMProvider } from '../../infra/llm/LLMProvider';
import { DataBlock, MessagePriority } from '../../messaging/DataBlock';
import { LATSPlanner } from './LATSPlanner';
import { TaskDAGGenerator } from './TaskDAGGenerator';

export class TaskPlanningService implements ITaskPlanningService {
    private activePromises: Set<Promise<void>> = new Set();
    private isShuttingDown = false;
    private readonly planner: LATSPlanner;
    private readonly generator: TaskDAGGenerator;

    constructor(
        private readonly llmProvider: LLMProvider,
        private readonly taskManager: ITaskManager,
        private readonly eventBus: IEventBus
    ) {
        this.planner = new LATSPlanner(this.llmProvider);
        this.generator = new TaskDAGGenerator(this.llmProvider);
    }

    public async initialize(): Promise<void> { }

    public async start(): Promise<void> { }

    public async stop(): Promise<void> {
        this.isShuttingDown = true;
        if (this.activePromises.size > 0) {
            console.log(`[TaskPlanningService] Waiting for ${this.activePromises.size} background tasks to complete...`);
            await Promise.allSettled(Array.from(this.activePromises));
        }
    }

    public strategizeAndPlanAsync(
        sessionId: string,
        agentId: string,
        objective: string,
        contextInfo: string,
        useMcts: boolean,
        mctsIterations: number,
        mode: 'holistic' | 'step_by_step',
        scoringCriteria?: string,
        expansionHint?: string
    ): void {
        if (this.isShuttingDown) return;

        const modeLabel = useMcts ? 'MCTS/LATS Strategy Search' : 'Direct DAG Generation (No MCTS)';

        const promise = this.runPlanning(sessionId, agentId, objective, contextInfo, useMcts, mctsIterations, mode, scoringCriteria, expansionHint);

        this.activePromises.add(promise);
        promise.finally(() => this.activePromises.delete(promise));
    }

    private async runPlanning(
        sessionId: string,
        agentId: string,
        objective: string,
        contextInfo: string,
        useMcts: boolean,
        mctsIterations: number,
        mode: 'holistic' | 'step_by_step',
        scoringCriteria?: string,
        expansionHint?: string
    ): Promise<void> {
        const modeLabel = mode === 'step_by_step' ? 'MCTS/LATS Step-by-Step Search' : 'MCTS/LATS Holistic Search';
        try {
            let strategy: string;
            if (useMcts) {
                strategy = await this.planner.search({
                    objective,
                    context: contextInfo || '',
                    maxIterations: mctsIterations,
                    mode,
                    scoringCriteria,
                    expansionHint
                });
            } else {
                strategy = `Direct Objective: ${objective}\nContext: ${contextInfo || ''}`; 
                if (expansionHint) strategy += `\nExpansion Hint: ${expansionHint}`;
                if (scoringCriteria) strategy += `\nScoring Criteria: ${scoringCriteria}`;
            }

            const tasks = await this.generator.generate(strategy);
            const tasksWithCreator = tasks.map(t => ({ ...t, creatorId: agentId }));
            this.taskManager.addTasks(sessionId, tasksWithCreator);

            const report = `[Background Planning Completed (Mode: ${modeLabel})]\nSuccessfully planned ${tasks.length} tasks for objective: "${objective}".\n\nStrategy Overview:\n${strategy}\n\nUse assign_task to assign tasks.`;

            const dataBlock = new DataBlock({
                sessionId: sessionId,
                senderId: 'SYSTEM',
                targetId: agentId,
                type: 'system',
                intent: 'BACKGROUND_TASK_COMPLETED',
                priority: MessagePriority.HIGH,
                controlPayload: report,
                metadata: {
                    senderName: 'System'
                }
            });

            this.eventBus.publish({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId: sessionId,
                payload: dataBlock
            });
        } catch (e: any) {
            const errorReport = `[Background Planning Failed (Mode: ${modeLabel})] Error: ${e.message}`;
            const dataBlock = new DataBlock({
                sessionId: sessionId,
                senderId: 'SYSTEM',
                targetId: agentId,
                type: 'system',
                intent: 'BACKGROUND_TASK_FAILED',
                priority: MessagePriority.URGENT,
                controlPayload: errorReport,
                metadata: {
                    senderName: 'System'
                }
            });

            this.eventBus.publish({
                type: AgentEvent.AgentMessage,
                timestamp: Date.now(),
                sessionId: sessionId,
                payload: dataBlock
            });
        }
    }
}
