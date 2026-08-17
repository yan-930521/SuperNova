import { ILifecycle } from '../lifecycle/ILifecycle';

export type TaskStatus = 'PENDING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELED';

/**
 * 代表系統中的一個最小工作單元
 */
export interface ITask {
    /** 任務的唯一識別碼 */
    id: string;
    /** 具體的任務指示與目標 */
    objective: string;
    /** 當前任務狀態 */
    status: TaskStatus;
    /** 必須先完成的前置任務 ID 陣列 */
    dependencies: string[];
    /** 負責執行此任務的子代理人 ID */
    assignedAgentId?: string;
    /** 任務成功時的回報，或失敗時的原因紀錄 */
    result?: string;
    /** 建立時間 (Unix Timestamp) */
    createdAt: number;
    /** 最後更新時間 (Unix Timestamp) */
    updatedAt: number;
    /** 建立此任務的 Agent ID (負責接收 READY 通知) */
    creatorId?: string;
}

/**
 * 創建任務時的參數型別 (忽略系統自動維護的欄位)
 */
export type CreateTaskPayload = Omit<ITask, 'status' | 'createdAt' | 'updatedAt' | 'assignedAgentId' | 'result'>;

/**
 * 任務狀態圖管理員介面 (Task Manager Interface)
 */
export interface ITaskManager extends ILifecycle {
    /**
     * 新增一個或多個任務進入 DAG
     * 若發現循環依賴 (Cycle)，應拋出錯誤
     */
    addTasks(sessionId: string, tasks: CreateTaskPayload[]): void;

    /**
     * 取得特定任務實體
     */
    getTask(sessionId: string, id: string): ITask | undefined;

    /**
     * 取得特定 Session 的所有任務清單
     */
    getAllTasks(sessionId: string): ITask[];

    /**
     * 取得特定 Session 中所有狀態為 READY 的任務
     */
    getReadyTasks(sessionId: string): ITask[];

    /**
     * 更新任務狀態
     */
    updateTaskStatus(sessionId: string, id: string, status: TaskStatus, result?: string): void;

    /**
     * 指派特定代理人執行該任務
     */
    assignTask(sessionId: string, id: string, agentId: string): void;
}

/**
 * 任務規劃服務介面
 */
export interface ITaskPlanningService extends ILifecycle {
    /**
     * 啟動背景規劃任務，完成後將透過 EventBus 發送結果
     */
    strategizeAndPlanAsync(
        sessionId: string,
        agentId: string,
        objective: string,
        contextInfo: string,
        useMcts: boolean,
        mctsIterations: number,
        mode: 'holistic' | 'step_by_step',
        scoringCriteria?: string,
        expansionHint?: string
    ): void;
}
