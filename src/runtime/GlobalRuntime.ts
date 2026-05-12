import type { IRuntime } from '../../interfaces/runtime/IRuntime';
import type { IEvent } from '../../interfaces/models/IEvent';
import type { IEventBus } from '../../interfaces/infra/IEventBus';
import type { ISessionManager } from '../../interfaces/infra/ISessionManager';
import type { IConfig } from '../../interfaces/config/IConfig';
import { ConfigLoader } from '../config/ConfigLoader';

/**
 * 全局運行時實作類 (Global Runtime)
 * 系統的核心大腦，驅動所有 Session 的 Tick 執行並管理全局通訊。
 */
export class GlobalRuntime implements IRuntime {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  public config?: IConfig;

  constructor(
    private sessionManager: ISessionManager,
    private eventBus: IEventBus
  ) {}

  /**
   * 啟動系統全局運行循環
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    // 若未手動注入配置，則從預設檔案加載
    if (!this.config) {
      const loader = new ConfigLoader();
      this.config = await loader.bootstrap('./supernova.json');
    }

    this.isRunning = true;
    
    // 從配置中獲取 Tick 頻率
    const tickRate = this.config.runtime.tick_rate_ms;
    
    this.timer = setInterval(async () => {
      await this.runTick();
    }, tickRate);
    
    console.log(`[GlobalRuntime] Runtime started with tick rate: ${tickRate}ms.`);
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
   */
  getActiveSessions(): Record<string, any> {
    return this.sessionManager.getActiveSessions();
  }

  /**
   * 發布全局事件
   */
  emitGlobalEvent(event: IEvent): void {
    this.eventBus.publish(event);
  }
}
