import type { IRuntime } from '../../interfaces/runtime/IRuntime';
import { Event } from '../models/Event';
import type { IEventBus } from '../../interfaces/infra/IEventBus';
import type { ISessionManager } from '../../interfaces/infra/ISessionManager';
import type { IAgentRegistry } from '../../interfaces/infra/IAgentRegistry';
import type { IConfig } from '../../interfaces/config/IConfig';
import { ConfigLoader } from '../config/ConfigLoader';
import { logger } from '../infra/LogManager';
import { ConsoleTransport } from '../infra/transports/ConsoleTransport';
import { FileTransport } from '../infra/transports/FileTransport';
import { LogLevel } from '../../interfaces/infra/ILogger';

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
    private eventBus: IEventBus,
    private agentRegistry?: IAgentRegistry
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

    // 初始化日誌系統
    const consoleLevel = (process.env.CONSOLE_LOG_LEVEL as LogLevel) || 'INFO';
    logger.addTransport(new ConsoleTransport(consoleLevel));
    logger.addTransport(new FileTransport('DEBUG'));
    logger.info('Logger initialized.', { type: 'SYSTEM' });

    // 自動載入 Agent
    if (this.agentRegistry) {
      const agentsDir = this.config?.runtime.agents_dir || './agents';
      const fallbackId = this.config?.runtime.default_fallback_agent_id || 'default-worker';

      // 同步配置到註冊表
      this.agentRegistry.updateConfig(agentsDir, fallbackId);

      logger.info(`Auto-loading agents from ${agentsDir}...`, { type: 'SYSTEM' });
      await this.agentRegistry.loadAllAgentsFromDir();
      
      // 確保預設 Worker 存在
      try {
        await this.agentRegistry.ensureDefaultWorker();
      } catch (e) {
        logger.warn(`${(e as Error).message}`, { type: 'SYSTEM' });
      }
    }

    this.isRunning = true;
    
    // 從配置中獲取 Tick 頻率
    const tickRate = this.config.runtime.tick_rate_ms;
    
    this.timer = setInterval(async () => {
      await this.runTick();
    }, tickRate);
    
    logger.info(`Runtime started with tick rate: ${tickRate}ms.`, { type: 'SYSTEM' });
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
    logger.info('Runtime stopped.', { type: 'SYSTEM' });
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
        logger.error(`Error in session ${sessionId} tick:`, { type: 'SYSTEM', session_id: sessionId, payload: error });
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
  emitGlobalEvent(event: Event): void {
    this.eventBus.publish(event);
  }
}
