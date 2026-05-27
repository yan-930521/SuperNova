import { IEventBus, SystemEventType } from './types/events';
import { recorder } from './LogManager';

export enum PulseHookType {
  INTERVAL = 'INTERVAL',
  THRESHOLD = 'THRESHOLD',
  EVENT = 'EVENT'
}

export enum PulseActionType {
  EMIT_EVENT = 'EMIT_EVENT',
  START_TASK = 'START_TASK',
  LOG = 'LOG'
}

/**
 * 脈搏掛鉤介面 (Pulse Hook Interface)
 */
export interface IPulseHook {
  id: string;
  type: PulseHookType;
  config: {
    interval?: number; // For INTERVAL
    path?: string;     // For THRESHOLD (e.g., 'env.temp')
    operator?: '>' | '<' | '==' | '>=' | '<=' | '!='; // For THRESHOLD
    threshold?: any;   // For THRESHOLD
    eventName?: string; // For EVENT
    logic?: (payload: any) => boolean; // For EVENT/THRESHOLD custom logic
  };
  action: {
    type: PulseActionType;
    payload: any;
  };
}

/**
 * 核心脈搏引擎 (Pulse Engine)
 * 負責驅動系統周期性任務與心跳。
 */
export class PulseEngine {
  private timer: NodeJS.Timeout | null = null;
  private tickCount: number = 0;
  private hooks: Map<string, IPulseHook> = new Map();
  private statePool: Record<string, any> = {};

  constructor(private eventBus: IEventBus) {}

  /**
   * 設定狀態值
   * 支援巢狀路徑，例如 'env.temp'
   */
  public setState(path: string, value: any): void {
    const keys = path.split('.');
    let current = this.statePool;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  /**
   * 取得狀態值
   * 支援巢狀路徑，例如 'env.temp'
   */
  public getState(path: string): any {
    return path.split('.').reduce((obj, key) => obj?.[key], this.statePool);
  }

  /**
   * 啟動引擎
   * @param intervalMs 脈搏間隔（毫秒），預設 1000ms
   */
  start(intervalMs: number = 1000): void {
    if (this.timer) return;
    
    recorder.info('Pulse Engine starting...', { type: 'SYSTEM' });
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  /**
   * 停止引擎
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      recorder.info('Pulse Engine stopped.', { type: 'SYSTEM' });
    }
  }

  /**
   * 註冊掛鉤
   */
  registerHook(hook: IPulseHook): void {
    this.hooks.set(hook.id, hook);
    recorder.info(`Registered pulse hook: ${hook.id} (type: ${hook.type})`, { type: 'SYSTEM' });

    // 如果是 EVENT 類型，需向 EventBus 訂閱
    if (hook.type === PulseHookType.EVENT && hook.config.eventName) {
      this.eventBus.subscribe(hook.config.eventName as SystemEventType, (event) => {
        this.handleEventHook(hook, event);
      });
    }
  }

  /**
   * 處理事件掛鉤
   */
  private handleEventHook(hook: IPulseHook, event: any): void {
    try {
      let triggered = true;
      if (hook.config.logic) {
        triggered = hook.config.logic(event.payload);
      }
      
      if (triggered) {
        this.executeAction(hook);
      }
    } catch (error) {
      recorder.error(`Error in event hook ${hook.id}:`, { type: 'SYSTEM', payload: { error } });
    }
  }

  /**
   * 執行掛鉤動作
   */
  private executeAction(hook: IPulseHook): void {
    const { action } = hook;
    switch (action.type) {
      case PulseActionType.EMIT_EVENT:
        this.eventBus.publish(action.payload);
        break;
      case PulseActionType.LOG:
        recorder.info(`PulseHook ${hook.id} log:`, { type: 'SYSTEM', payload: action.payload });
        break;
      case PulseActionType.START_TASK:
        recorder.warn(`PulseHook ${hook.id}: START_TASK is not yet integrated with TaskManager.`, { type: 'SYSTEM' });
        break;
    }
  }

  /**
   * 移除掛鉤
   */
  unregisterHook(id: string): void {
    this.hooks.delete(id);
  }

  /**
   * 核心 Tick 邏輯
   */
  private tick(): void {
    this.tickCount++;
    recorder.debug(`[PulseEngine] tick: ${this.tickCount}`, { type: 'SYSTEM' });
    
    // 發布系統 Tick 事件
    this.eventBus.publish({
      type: SystemEventType.SYSTEM_TICK,
      userId: 'SYSTEM',
      sessionId: 'SYSTEM',
      payload: { tickCount: this.tickCount },
      timestamp: Date.now()
    });

    // 執行過期的掛鉤
    for (const hook of this.hooks.values()) {
      try {
        if (this.isTriggered(hook)) {
          this.executeAction(hook);
        }
      } catch (error) {
        recorder.error(`Error in pulse hook ${hook.id}:`, { type: 'SYSTEM', payload: { error } });
      }
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
        case '>': triggered = value > threshold; break;
        case '<': triggered = value < threshold; break;
        case '==': triggered = value == threshold; break;
        case '>=': triggered = value >= threshold; break;
        case '<=': triggered = value <= threshold; break;
        case '!=': triggered = value != threshold; break;
      }

      if (!triggered && hook.config.logic) {
        triggered = hook.config.logic(value);
      }
      return triggered;
    }

    return false;
  }
}
