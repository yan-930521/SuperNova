export enum SystemEventType {
  CHAIN_CREATED = 'CHAIN_CREATED',
  TASK_STARTED = 'TASK_STARTED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  PLAN_UPDATED = 'PLAN_UPDATED',
  SYSTEM_TICK = 'SYSTEM_TICK',
  TASK_HEARTBEAT = 'TASK_HEARTBEAT',
  CHAIN_STATUS_UPDATED = 'CHAIN_STATUS_UPDATED',
  TASK_STATUS_UPDATED = 'TASK_STATUS_UPDATED',
  AGENT_MESSAGE = 'AGENT_MESSAGE'
}

/**
 * 代理發言事件 Payload
 */
export interface IAgentMessagePayload {
  agentId: string;
  sessionId: string
  role: string; // MessageRole
  content: string;
  messageType: 'reply' | 'summary' | 'trace' | 'proactive';
  chainId?: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

/**
 * 任務鏈建立事件 Payload
 */
export interface IChainCreatedPayload {
  goal: string;
  nodes: any[];
  requesterId?: string;
}

/**
 * 任務鏈狀態更新事件 Payload
 */
export interface IChainStatusUpdatedPayload {
  chainId: string;
  sessionId: string;
  status: string;
  oldStatus: string;
  goal: string;
  requesterId?: string;
}

/**
 * 任務開始事件 Payload
 */
export interface ITaskStartedPayload {
  taskId: string;
  agentId: string;
  goal: string;
}

/**
 * 任務完成事件 Payload
 */
export interface ITaskCompletedPayload {
  taskId: string;
  sessionId: string;
  agentId: string;
  summary: string;
  result: any;
}

/**
 * 任務失敗事件 Payload
 */
export interface ITaskFailedPayload {
  taskId: string;
  error: string;
  retryCount?: number;
}

/**
 * 任務狀態通用更新事件 Payload
 */
export interface ITaskStatusUpdatedPayload {
  taskId: string;
  chainId: string;
  status: string;
  oldStatus: string;
  goal: string;
  error?: string;
}

/**
 * 任務心跳事件 Payload
 */
export interface ITaskHeartbeatPayload {
  taskId: string;
  timestamp: number;
}

/**
 * 規劃更新事件 Payload
 */
export interface IPlanUpdatedPayload {
  chainId: string;
  milestones: string[];
  currentMilestoneIdx: number;
}

/**
 * 系統脈搏事件 Payload
 */
export interface ISystemTickPayload {
  tickCount: number;
  uptime: number;
}

export interface ISystemEvent<T = any> {
  type: SystemEventType;
  userId: string;
  sessionId: string;
  payload: T;
  timestamp: number;
}

export interface IEventBus {
  publish<T = any>(event: ISystemEvent<T>): void;
  subscribe<T = any>(type: SystemEventType, handler: (event: ISystemEvent<T>) => void): void;
  unsubscribe<T = any>(type: SystemEventType, handler: (event: ISystemEvent<T>) => void): void;
}
