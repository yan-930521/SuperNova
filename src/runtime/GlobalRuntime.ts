import { IRuntime } from '../../interfaces/runtime/IRuntime';
import { IEvent } from '../../interfaces/models/IEvent';
import { IEventBus } from '../../interfaces/infra/IEventBus';
import { ISessionManager } from '../../interfaces/infra/ISessionManager';

/**
 * 全局運行時實作類 (Global Runtime)
 * 系統的核心大腦，驅動所有 Session 的 Tick 執行並管理全局通訊。
 */
export class GlobalRuntime implements IRuntime {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    private sessionManager: ISessionManager,
    private eventBus: IEventBus,
    private tickRate: number = 100
  ) {}

  /**
   * 啟動系統全局運行循環
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    this.timer = setInterval(async () => {
      await this.runTick();
    }, this.tickRate);
    
    console.log('[GlobalRuntime] Runtime started.');
  }

  /**
   * 停止系統運行循環
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[GlobalRuntime] Runtime stopped.');
  }

  /**
   * 執行單次 Tick，遍歷所有 Session 進行更新
   */
  private async runTick(): Promise<void> {
    const sessions = await this.getActiveSessions();
    for (const sessionId in sessions) {
      const session = sessions[sessionId];
      try {
        await session.tick();
      } catch (error) {
        console.error(`[GlobalRuntime] Error in session ${sessionId} tick:`, error);
      }
    }
  }

  /**
   * 獲取當前活躍的 Session 集合
   * (這裡暫時轉型為 any 以支援 getActiveSessions 方法，未來需在 ISessionManager 中擴充)
   */
  async getActiveSessions(): Promise<Record<string, any>> {
    const sm = this.sessionManager as any;
    if (sm.getActiveSessions) {
      return sm.getActiveSessions();
    }
    return {};
  }

  /**
   * 發布全局事件
   */
  emitGlobalEvent(event: IEvent): void {
    this.eventBus.publish(event);
  }
}
