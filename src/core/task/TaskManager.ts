import { AgentEvent, HookEvent, IEventBus, PromptSectionIndex, SystemEvent } from '../domain/IBus';
import { CreateTaskPayload, ITask, ITaskManager, TaskStatus } from '../domain/ITask';
import { DataBlock, MessagePriority } from '../messaging/DataBlock';

export class TaskManager implements ITaskManager {
    // Map<sessionId, Map<taskId, ITask>>
    private sessionTasks: Map<string, Map<string, ITask>> = new Map();

    constructor(private readonly eventBus: IEventBus) { }

    public async initialize(): Promise<void> {

        this.eventBus.subscribe(SystemEvent.TaskFinished, (e) => {
            const sessionId = e.sessionId;
            if (sessionId && this.getTask(sessionId, e.payload.taskId)) {
                this.updateTaskStatus(sessionId, e.payload.taskId, 'COMPLETED', e.payload.result);
            }
        });

        this.eventBus.subscribe(SystemEvent.TaskFailed, (e) => {
            const sessionId = e.sessionId;
            if (sessionId && this.getTask(sessionId, e.payload.taskId)) {
                this.updateTaskStatus(sessionId, e.payload.taskId, 'FAILED', e.payload.error);
            }
        });

        this.eventBus.subscribe(HookEvent.BeforeAgentStep, async (event) => {
            const sessionId = event.sessionId;
            if (!sessionId) return;
            
            const tasks = this.getAllTasks(sessionId);
            if (tasks.length === 0) return;

            const isCreator = tasks.some(t => t.creatorId === event.payload.agentId);
            const agentTasks = tasks.filter(t => t.assignedAgentId === event.payload.agentId);

            if (!isCreator && agentTasks.length === 0) return;

            let report = "";

            if (agentTasks.length > 0) {
                report += "## Task Dashboard (Assigned to you)\n";
                for (const t of agentTasks) {
                    let icon = '⏳';
                    if (t.status === 'READY') icon = '🟢';
                    if (t.status === 'IN_PROGRESS') icon = '🚀';
                    if (t.status === 'COMPLETED') icon = '✅';
                    if (t.status === 'FAILED') icon = '❌';
                    if (t.status === 'CANCELED') icon = '🚫';

                    report += `- ${icon} **[${t.id}]** (${t.status}) - ${t.objective}\n`;
                    if (t.dependencies.length > 0) report += `  - Depends on: ${t.dependencies.join(', ')}\n`;
                    if (t.creatorId) report += `  - Created by: ${t.creatorId}\n`;
                    if (t.result) report += `  - Result: ${t.result}\n`;
                }
                report += "\n";
            }

            if (isCreator) {
                report += "## Session Task Tree (Global)\n";
                const roots = tasks.filter(t => !tasks.some(other => other.dependencies.includes(t.id)));
                
                const getIcon = (status: string) => {
                    if (status === 'READY') return '🟢';
                    if (status === 'IN_PROGRESS') return '🚀';
                    if (status === 'COMPLETED') return '✅';
                    if (status === 'FAILED') return '❌';
                    if (status === 'CANCELED') return '🚫';
                    return '⏳';
                };

                const visited = new Set<string>();
                const buildTree = (taskId: string, indent: string): string => {
                    const task = tasks.find(t => t.id === taskId);
                    if (!task) return "";
                    
                    let line = `${indent}- ${getIcon(task.status)} **[${task.id}]** (${task.status})`;
                    if (task.assignedAgentId) line += ` [Assignee: ${task.assignedAgentId}]`;
                    line += ` - ${task.objective}\n`;

                    if (visited.has(taskId)) {
                        return line;
                    }
                    visited.add(taskId);

                    for (const depId of task.dependencies) {
                        line += buildTree(depId, indent + "  ");
                    }
                    return line;
                };

                for (const root of roots) {
                    report += buildTree(root.id, "");
                }
            }

            if (report) {
                if (!event.payload.injectedPrompts) event.payload.injectedPrompts = [];
                event.payload.injectedPrompts.push({
                    index: PromptSectionIndex.TASK_DASHBOARD,
                    content: report.trim()
                });
            }
        });
    }

    public async start(): Promise<void> {
        // 留空，實作 ILifecycle
    }

    public async stop(): Promise<void> {
        this.sessionTasks.clear();
    }

    private getSessionMap(sessionId: string): Map<string, ITask> {
        let map = this.sessionTasks.get(sessionId);
        if (!map) {
            map = new Map<string, ITask>();
            this.sessionTasks.set(sessionId, map);
        }
        return map;
    }

    public addTasks(sessionId: string, payloads: CreateTaskPayload[]): void {
        const tasks = this.getSessionMap(sessionId);
        const newTasks: Map<string, ITask> = new Map();

        for (const p of payloads) {
            if (tasks.has(p.id)) {
                throw new Error(`Task with id ${p.id} already exists in session ${sessionId}`);
            }
            newTasks.set(p.id, {
                ...p,
                status: 'PENDING',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        for (const [id, t] of newTasks) {
            tasks.set(id, t);
        }

        try {
            this.validateDAG(sessionId);
            this.refreshTaskStates(sessionId);
        } catch (e) {
            for (const id of newTasks.keys()) {
                tasks.delete(id);
            }
            throw e;
        }
    }

    public getTask(sessionId: string, id: string): ITask | undefined {
        return this.getSessionMap(sessionId).get(id);
    }

    public getAllTasks(sessionId: string): ITask[] {
        return Array.from(this.getSessionMap(sessionId).values());
    }

    public getReadyTasks(sessionId: string): ITask[] {
        return this.getAllTasks(sessionId).filter(t => t.status === 'READY');
    }

    public updateTaskStatus(sessionId: string, id: string, status: TaskStatus, result?: string): void {
        const tasks = this.getSessionMap(sessionId);
        const task = tasks.get(id);
        if (!task) throw new Error(`Task ${id} not found`);

        task.status = status;
        if (result !== undefined) {
            task.result = result;
        }
        task.updatedAt = Date.now();

        if (status === 'FAILED' || status === 'CANCELED') {
            this.cancelTaskCascading(sessionId, id, `因前置任務 ${id} 失敗或取消而連帶中斷`);
        }
        else if (status === 'COMPLETED') {
            this.refreshTaskStates(sessionId);
        }
    }

    public assignTask(sessionId: string, id: string, agentId: string): void {
        const tasks = this.getSessionMap(sessionId);
        const task = tasks.get(id);
        if (!task) throw new Error(`Task ${id} not found`);
        if (task.status !== 'READY' && task.status !== 'PENDING') throw new Error(`Task ${id} is currently ${task.status}, expected READY or PENDING`);

        task.assignedAgentId = agentId;
        task.updatedAt = Date.now();

        this.assignDownstreamTasks(sessionId, id, agentId);
        this.refreshTaskStates(sessionId);
    }

    private assignDownstreamTasks(sessionId: string, rootId: string, agentId: string): void {
        const dependents = this.getAllTasks(sessionId).filter(t => t.dependencies.includes(rootId));
        for (const t of dependents) {
            if (!t.assignedAgentId) {
                t.assignedAgentId = agentId;
                t.updatedAt = Date.now();
                this.assignDownstreamTasks(sessionId, t.id, agentId);
            }
        }
    }

    /**
     * 連鎖取消所有依賴於指定任務的後續任務
     */
    private cancelTaskCascading(sessionId: string, id: string, reason: string): void {
        const dependents = this.getAllTasks(sessionId).filter(t => t.dependencies.includes(id));
        for (const t of dependents) {
            if (t.status === 'PENDING' || t.status === 'READY') {
                this.updateTaskStatus(sessionId, t.id, 'CANCELED', reason);
            }
        }
    }

    private refreshTaskStates(sessionId: string): void {
        const tasks = this.getSessionMap(sessionId);
        const allTasks = this.getAllTasks(sessionId);
        const pendingTasks = allTasks.filter(t => t.status === 'PENDING');

        // 1. PENDING -> READY
        for (const task of pendingTasks) {
            const deps = task.dependencies.map(depId => tasks.get(depId));
            const allCompleted = deps.every(d => d && d.status === 'COMPLETED');
            if (allCompleted) {
                task.status = 'READY';
                task.updatedAt = Date.now();
            }
        }

        // 2. READY -> IN_PROGRESS (Trigger assignment messages)
        const readyTasks = allTasks.filter(t => t.status === 'READY');
        for (const task of readyTasks) {
            if (task.assignedAgentId) {
                task.status = 'IN_PROGRESS';
                task.updatedAt = Date.now();

                const dataBlock = new DataBlock({
                    sessionId,
                    senderId: 'SYSTEM',
                    targetId: task.assignedAgentId,
                    type: 'system',
                    intent: 'TASK_ASSIGNMENT',
                    priority: MessagePriority.HIGH,
                    controlPayload: `[TASK ASSIGNMENT] Your objective is:\nTask ID: ${task.id}\nObjective: ${task.objective}\n\nPlease start execution. When you finish, you MUST call the update_task_status tool.`
                });

                this.eventBus.publish({
                    type: AgentEvent.AgentMessage,
                    timestamp: Date.now(),
                    sessionId,
                    payload: dataBlock
                });
            }
        }

        // 3. 檢查是否有整個 DAG 已經全部進入終結狀態 (COMPLETED, FAILED, CANCELED)
        const byAssignee = new Map<string, ITask[]>();
        for (const t of allTasks) {
            if (t.assignedAgentId) {
                const arr = byAssignee.get(t.assignedAgentId) || [];
                arr.push(t);
                byAssignee.set(t.assignedAgentId, arr);
            }
        }

        for (const [assigneeId, assigneeTasks] of byAssignee) {
            const allTerminal = assigneeTasks.every(t => ['COMPLETED', 'FAILED', 'CANCELED'].includes(t.status));
            if (allTerminal && assigneeTasks.length > 0) {
                // 清理已經結束的任務，避免重複發送通知
                for (const t of assigneeTasks) {
                    tasks.delete(t.id);
                }

                // 總結任務執行結果
                const summary = assigneeTasks
                    .map(t => `- [${t.id}] ${t.status}: ${t.objective}`)
                    .join('\n');

                const dataBlock = new DataBlock({
                    sessionId,
                    senderId: 'SYSTEM',
                    targetId: assigneeId,
                    type: 'system',
                    intent: 'TASK_COMPLETED',
                    priority: MessagePriority.HIGH,
                    controlPayload: `[TASK COMPLETED] All tasks assigned to you have reached a terminal state (COMPLETED, FAILED, or CANCELED):\n${summary}\n\nPlease summarize these results and use the update_task_status tool to report your final status.`,
                    metadata: {
                        senderName: 'System'
                    }
                });

                this.eventBus.publish({
                    type: AgentEvent.AgentMessage,
                    timestamp: Date.now(),
                    sessionId,
                    payload: dataBlock
                });
            }
        }
    }
    /**
     * 驗證整個依賴網路沒有循環依賴 (Cycle)，並且所有的依賴都實際存在
     */
    private validateDAG(sessionId: string): void {
        const tasks = this.getSessionMap(sessionId);
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (taskId: string) => {
            if (visiting.has(taskId)) {
                throw new Error(`Cycle detected involving task: ${taskId}`);
            }
            if (visited.has(taskId)) return;

            visiting.add(taskId);
            const task = tasks.get(taskId);

            if (task) {
                for (const depId of task.dependencies) {
                    if (!tasks.has(depId)) {
                        throw new Error(`Task ${taskId} depends on unknown task ${depId}`);
                    }
                    visit(depId);
                }
            }

            visiting.delete(taskId);
            visited.add(taskId);
        };

        for (const task of tasks.values()) {
            if (!visited.has(task.id)) {
                visit(task.id);
            }
        }
    }
}
