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
    operator?: '>' | '<' | '==' | '>='; // For THRESHOLD
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

  constructor(private eventBus: IEventBus) {}

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
    console.log(`[PulseEngine] tick: ${this.tickCount}`);
    
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
      if (hook.type === PulseHookType.INTERVAL && hook.config.interval) {
        if (this.tickCount % hook.config.interval === 0) {
          try {
            if (hook.action.type === PulseActionType.EMIT_EVENT) {
              this.eventBus.publish(hook.action.payload);
            } else if (hook.action.type === PulseActionType.LOG) {
              recorder.info(`PulseHook ${hook.id} log:`, { type: 'SYSTEM', payload: hook.action.payload });
            }
          } catch (error) {
            recorder.error(`Error in pulse hook ${hook.id}:`, { type: 'SYSTEM', payload: { error } });
          }
        }
      }
    }
  }
}
