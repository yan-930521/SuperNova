export interface TaskDTO {
  id: string;
  sessionId: string;
  type: string;
  goal: string;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  dependencies: string[];
  assignedAgentId?: string | null;
  requiredCapabilities?: string[];
  toolRouting?: {
    preferredTools?: string[];
    forbiddenTools?: string[];
  };
  options?: {
    timeout?: number;
    maxRetries?: number;
    isCritical?: boolean;
  };
  result?: any;
  metadata?: Record<string, any>;
}

export interface ITaskRepository {
  save(task: TaskDTO): Promise<void>;
  findBySession(sessionId: string): Promise<TaskDTO[]>;
  findById(id: string): Promise<TaskDTO | null>;
}
