import { IEventBus, SystemEvent } from '../domain/IBus';
import { CreateTaskPayload, ITask, ITaskManager, TaskStatus } from '../domain/ITask';

export class TaskManager implements ITaskManager {
    // Map<sessionId, Map<taskId, ITask>>
    private sessionTasks: Map<string, Map<string, ITask>> = new Map();
    
    constructor(private readonly eventBus: IEventBus) {}

    public async initialize(): Promise<void> {
        
        this.eventBus.subscribe(SystemEvent.TaskFinished, (e) => {
            const sessionId = e.sessionId;
            if (sessionId && this.getTask(sessionId, e.payload.taskId)) {
                this.updateTaskStatus(sessionId, e.payload.taskId, 'COMPLETED');
            }
        });

        this.eventBus.subscribe(SystemEvent.TaskFailed, (e) => {
            const sessionId = e.sessionId;
            if (sessionId && this.getTask(sessionId, e.payload.taskId)) {
                this.updateTaskStatus(sessionId, e.payload.taskId, 'FAILED', e.payload.error);
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
        if (task.status !== 'READY') throw new Error(`Task ${id} is currently ${task.status}, expected READY`);
        
        task.assignedAgentId = agentId;
        task.status = 'IN_PROGRESS';
        task.updatedAt = Date.now();
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
        const pendingTasks = this.getAllTasks(sessionId).filter(t => t.status === 'PENDING');
        for (const task of pendingTasks) {
            const deps = task.dependencies.map(depId => tasks.get(depId));
            
            const allCompleted = deps.every(d => d && d.status === 'COMPLETED');
            if (allCompleted) {
                task.status = 'READY';
                task.updatedAt = Date.now();
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
