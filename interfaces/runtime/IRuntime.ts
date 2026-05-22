import type { Event } from '../../src/models/Event';
import type { ISession } from '../session/ISession';
import type { IConfig } from '../config/IConfig';

/**
 * 全局運行時大腦接口 (Runtime Brain)
 * 負責協調整個 SuperNova 系統的生命週期與全局事件分發。
 */
export interface IRuntime {
  /** 系統全局配置 */
  readonly config?: IConfig;

  /** 啟動運行時環境 */
  start(): Promise<void>;
  
  /** 停止運行時環境，確保所有資源安全釋放 */
  stop(): Promise<void>;
  
  /** 獲取當前所有活動中的會話 */
  getActiveSessions(): Record<string, ISession>;
  
  /** 分發全局事件，觸發跨會話或跨系統的響應 */
  emitGlobalEvent(event: Event): void;
}
