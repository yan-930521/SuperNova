export enum SystemEventType {
  SESSION_CREATED = 'SESSION_CREATED',
  TASK_STARTED = 'TASK_STARTED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  PLAN_UPDATED = 'PLAN_UPDATED',
  SYSTEM_TICK = 'SYSTEM_TICK',
  TASK_HEARTBEAT = 'TASK_HEARTBEAT'
}

export interface ISystemEvent<T = any> {
  type: SystemEventType;
  userId: string;
  sessionId: string;
  payload: T;
  timestamp: number;
}

export interface IEventBus {
  publish(event: ISystemEvent): void;
  subscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void;
  unsubscribe(type: SystemEventType, handler: (event: ISystemEvent) => void): void;
}
