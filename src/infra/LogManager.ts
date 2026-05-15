import { ILogger, ILogEntry, ILogTransport, LogLevel } from '../../interfaces/infra/ILogger';

/**
 * LogManager 實作類
 * 採用單例或全域服務模式，管理多個傳輸器並分發日誌。
 */
export class LogManager implements ILogger {
  private static instance: LogManager;
  private transports: ILogTransport[] = [];
  private levelPriority: Record<LogLevel, number> = {
    'DEBUG': 0,
    'INFO': 1,
    'WARN': 2,
    'ERROR': 3
  };

  private constructor() {}

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  public addTransport(transport: ILogTransport): void {
    this.transports.push(transport);
  }

  public debug(message: string, context?: Partial<ILogEntry>): void {
    this.log('DEBUG', message, context);
  }

  public info(message: string, context?: Partial<ILogEntry>): void {
    this.log('INFO', message, context);
  }

  public warn(message: string, context?: Partial<ILogEntry>): void {
    this.log('WARN', message, context);
  }

  public error(message: string, context?: Partial<ILogEntry>): void {
    this.log('ERROR', message, context);
  }

  private log(level: LogLevel, message: string, context?: Partial<ILogEntry>): void {
    const entry: ILogEntry = {
      timestamp: new Date().toISOString(),
      level,
      type: context?.type || 'SYSTEM',
      message,
      ...context
    };

    for (const transport of this.transports) {
      // 只有當 entry 等級 >= transport 設定的等級時才發送
      if (this.levelPriority[level] >= this.levelPriority[transport.level]) {
        try {
          transport.send(entry);
        } catch (err) {
          // 日誌傳輸器的錯誤不應中斷主流程
          process.stderr.write(`[LogManager] Transport ${transport.name} failed: ${err}\n`);
        }
      }
    }
  }
}

// 導出全域單例
export const logger = LogManager.getInstance();
