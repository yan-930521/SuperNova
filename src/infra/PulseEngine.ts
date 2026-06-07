import { ILifecycle } from '../core/lifecycle/ILifecycle';
import { AllEventTypes, Events, IEvent, IEventBus } from '../core/messaging/IBus';
import { recorder } from './LogManager';

/**
 * 脈搏掛鉤類型
 */
export enum PulseHookType {
  /** 定期觸發 */
  INTERVAL = 'INTERVAL',
  /** 數值閾值觸發 */
  THRESHOLD = 'THRESHOLD',
  /** 監聽特定事件觸發 */
  EVENT = 'EVENT'
}

/**
 * 脈搏掛鉤動作類型
 */
export enum PulseActionType {
  /** 發布一個新事件 */
  EMIT_EVENT = 'EMIT_EVENT',
  /** 記錄日誌 */
  LOG = 'LOG',
  /** (預留) 啟動新任務 */
  START_TASK = 'START_TASK',
}

/**
 * 脈搏掛鉤介面 (Pulse Hook Interface)
 */
export interface IPulseHook {
  id: string;
  type: PulseHookType;
  config: {
    interval?: number; // 適用於 INTERVAL
    path?: string;     // 適用於 THRESHOLD (例如: 'env.temp')
    operator?: '>' | '<' | '==' | '>=' | '<=' | '!='; // 適用於 THRESHOLD
    threshold?: number | string | boolean;   // 適用於 THRESHOLD
    eventType?: AllEventTypes; // 適用於 EVENT
    logic?: (payload: unknown) => boolean; // 自定義邏輯
  };
  action: {
    type: PulseActionType;
    payload: unknown;
  };
}

/**
 * 核心脈搏引擎 (Pulse Engine)
 * 負責驅動系統周期性任務、心跳偵測與自動化掛鉤執行。
 */
export class PulseEngine implements ILifecycle {
  private timer: NodeJS.Timeout | null = null;
  private tickCount: number = 0;
  private hooks = new Map<string, IPulseHook>();
  private statePool: Record<string, unknown> = {};
  private eventHandlers = new Map<string, (event: IEvent<any, any>) => void>();
  private watchTasks = new Map<string, { lastActive: number, timeout: number }>();

  constructor(private eventBus: IEventBus) {}

  /**
   * 生命週期：初始化
   */
  async initialize(): Promise<void> {
    recorder.info('[PulseEngine] Initializing pulse engine...', { type: 'SYSTEM' });
  }

  /**
   * 生命週期：啟動引擎
   */
  async start(): Promise<void> {
    if (this.timer) return;
    
    recorder.info('[PulseEngine] Pulse Engine starting...', { type: 'SYSTEM' });
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /**
   * 生命週期：停止引擎
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      recorder.info('[PulseEngine] Pulse Engine stopped.', { type: 'SYSTEM' });
    }
  }

  /**
   * 將任務加入監控清單
   * @param taskId 任務 ID
   * @param traceId 追蹤 ID
   * @param timeout 超時時間 (ms)，預設 30000ms
   */
  public watchTask(taskId: string, traceId: string, timeout: number = 30000): void {
    this.watchTasks.set(taskId, { lastActive: Date.now(), timeout, traceId });
    recorder.info(`[PulseEngine] Watching task ${taskId} (Trace: ${traceId}, Timeout: ${timeout}ms)`, { type: 'SYSTEM' });
  }

  /**
   * 移除任務監控
   */
  public unwatchTask(taskId: string): void {
    this.watchTasks.delete(taskId);
    recorder.info(`[PulseEngine] Unwatched task ${taskId}`, { type: 'SYSTEM' });
  }

  /**
   * 更新任務心跳
   */
  public updateHeartbeat(taskId: string): void {
    const info = this.watchTasks.get(taskId);
    if (info) {
      info.lastActive = Date.now();
      recorder.debug(`[PulseEngine] Updated heartbeat for task ${taskId}`, { type: 'SYSTEM' });
    }
  }

  /**
   * 設定狀態池數值
   * 支援巢狀路徑，例如 'env.temp'
   */
  public setState(path: string, value: unknown): void {
    const keys = path.split('.');
    let current = this.statePool as any;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  /**
   * 取得狀態池數值
   */
  public getState(path: string): unknown {
    return path.split('.').reduce((obj, key) => (obj as any)?.[key], this.statePool);
  }

  /**
   * 註冊掛鉤
   */
  registerHook(hook: IPulseHook): void {
    if (this.hooks.has(hook.id)) {
      this.unregisterHook(hook.id);
    }

    this.hooks.set(hook.id, hook);
    recorder.info(`[PulseEngine] Registered hook: ${hook.id} (type: ${hook.type})`, { type: 'SYSTEM' });

    // 如果是 EVENT 類型，需訂閱新總線
    if (hook.type === PulseHookType.EVENT && hook.config.eventType) {
      const handler = (event: IEvent<any, any>) => {
        this.handleEventHook(hook, event);
      };
      this.eventHandlers.set(hook.id, handler);
      this.eventBus.subscribe(hook.config.eventType, handler);
    }
  }

  /**
   * 移除掛鉤
   */
  unregisterHook(id: string): void {
    const hook = this.hooks.get(id);
    if (!hook) return;

    if (hook.type === PulseHookType.EVENT && hook.config.eventType) {
      const handler = this.eventHandlers.get(id);
      if (handler) {
        this.eventBus.unsubscribe(hook.config.eventType, handler);
        this.eventHandlers.delete(id);
      }
    }

    this.hooks.delete(id);
    recorder.info(`[PulseEngine] Unregistered pulse hook: ${id}`, { type: 'SYSTEM' });
  }

  /**
   * 核心 Tick 邏輯
   */
  private tick(): void {
    this.tickCount++;
    // recorder.debug(`[PulseEngine] tick: ${this.tickCount}`, { type: 'SYSTEM' });

    // 0. 發布系統脈搏事件 (驅動排程器)
    this.eventBus.publish({
      type: Events.System.Tick,
      timestamp: Date.now(),
      payload: { tickCount: this.tickCount }
    });
    
    // 1. 檢查任務超時
    for (const [taskId, info] of this.watchTasks.entries()) {
      if (Date.now() - info.lastActive > info.timeout) {
        recorder.warn(`[PulseEngine] Task ${taskId} timed out.`, { type: 'SYSTEM' });
        
        // 發布新的強型別任務失敗事件
        this.eventBus.publish({
          type: Events.Task.Failed,
          timestamp: Date.now(),
          payload: { 
            taskId, 
            error: `Execution timeout: No heartbeat received for ${info.timeout / 1000}s` 
          }
        });
        
        this.watchTasks.delete(taskId);
      }
    }

    // 2. 檢查掛鉤觸發
    for (const hook of this.hooks.values()) {
      try {
        if (this.isTriggered(hook)) {
          this.executeAction(hook);
        }
      } catch (error) {
        recorder.error(`[PulseEngine] Hook execution failed: ${hook.id}`, { 
          type: 'SYSTEM', 
          payload: { error: error instanceof Error ? error.message : String(error) } 
        });
      }
    }
  }

  /**
   * 處理事件掛鉤
   */
  private handleEventHook(hook: IPulseHook, event: IEvent<any, any>): void {
    try {
      let triggered = true;
      if (hook.config.logic) {
        triggered = hook.config.logic(event.payload);
      }
      
      if (triggered) {
        this.executeAction(hook);
      }
    } catch (error) {
      recorder.error(`[PulseEngine] Event hook handling failed: ${hook.id}`, { 
        type: 'SYSTEM', 
        payload: { error: error instanceof Error ? error.message : String(error) } 
      });
    }
  }

  /**
   * 執行掛鉤動作
   */
  private executeAction(hook: IPulseHook): void {
    const { action } = hook;
    switch (action.type) {
      case PulseActionType.EMIT_EVENT:
        this.eventBus.publish(action.payload as IEvent<any, any>);
        break;
      case PulseActionType.LOG:
        recorder.info(`[PulseEngine] Hook ${hook.id} action: ${JSON.stringify(action.payload)}`, { type: 'SYSTEM' });
        break;
      case PulseActionType.START_TASK:
        recorder.warn(`[PulseEngine] Hook ${hook.id}: START_TASK is not yet implemented for the new TaskService.`, { type: 'SYSTEM' });
        break;
    }
  }

  /**
   * 檢查掛鉤是否觸發
   */
  private isTriggered(hook: IPulseHook): boolean {
    if (hook.type === PulseHookType.INTERVAL && hook.config.interval) {
      return this.tickCount % hook.config.interval === 0;
    }

    if (hook.type === PulseHookType.THRESHOLD) {
      const value = this.getState(hook.config.path || '');
      const threshold = hook.config.threshold;
      let triggered = false;

      switch (hook.config.operator) {
        case '>': triggered = (value as any) > (threshold as any); break;
        case '<': triggered = (value as any) < (threshold as any); break;
        case '==': triggered = (value as any) == (threshold as any); break;
        case '>=': triggered = (value as any) >= (threshold as any); break;
        case '<=': triggered = (value as any) <= (threshold as any); break;
        case '!=': triggered = (value as any) != (threshold as any); break;
      }

      if (!triggered && hook.config.logic) {
        triggered = hook.config.logic(value);
      }
      return triggered;
    }

    return false;
  }
}
