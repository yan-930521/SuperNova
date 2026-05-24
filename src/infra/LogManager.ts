/**
 * 日誌等級定義
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * 結構化操作類型 Enum (僅限主動動作與動作結果)
 */
export enum RecordAction {
  /** 代理的主動思考/決策行為 */
  THOUGHT = 'THOUGHT',
  /** 發起工具呼叫 */
  TOOL_CALL = 'TOOL_CALL',
  /** 執行結果產出或狀態變更 */
  STATE_MUTATION = 'STATE_MUTATION',
  /** 主動執行規劃變更/重新規劃 */
  PLAN_UPDATE = 'PLAN_UPDATE'
}

/**
 * 日誌條目結構 (JSONL 格式基準)
 */
export interface ILogEntry {
  timestamp: string;      // ISO8601
  level: LogLevel;
  type: string;           // 業務類型
  session_id?: string;    
  agent_id?: string;      
  trace_id?: string;      
  message: string;        
  payload?: any;          // 原始數據
}

/**
 * 日誌傳輸器接口
 */
export interface ILogTransport {
  name: string;
  level: LogLevel;
  send(entry: ILogEntry): void;
}

/**
 * LogManager 實作類 (Recorder 邏輯後台)
 */
export class LogManager {
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

  /**
   * 紀錄主動操作及其結果 (Record)
   * 這些紀錄預設均為 INFO 級別，以確保在控制台可見。
   */
  public record(action: RecordAction, message: string, context: Partial<ILogEntry> = {}): void {
    switch (action) {
      case RecordAction.THOUGHT:
        // 思考過程在控制台顯示簡短版，完整版保留在 payload
        const shortThought = message.length > 100 ? message.substring(0, 100) + '...' : message;
        this.log('INFO', `🧠 [Thought] ${shortThought}`, { ...context, type: 'THOUGHT', payload: { fullThought: message, ...context.payload } });
        break;
      case RecordAction.TOOL_CALL:
        this.log('INFO', `🛠️  [Action] ${message}`, { ...context, type: 'ACTION' });
        break;
      case RecordAction.STATE_MUTATION:
        this.log('INFO', `✅ [Result] ${message}`, { ...context, type: 'RESULT' });
        break;
      case RecordAction.PLAN_UPDATE:
        this.log('INFO', `📅 [Plan] ${message}`, { ...context, type: 'PLAN' });
        break;
    }
  }

  // --- 基礎日誌方法 (Event / Status) ---

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
      if (this.levelPriority[level] >= this.levelPriority[transport.level]) {
        try {
          transport.send(entry);
        } catch (err) {
          process.stderr.write(`[Recorder] Transport ${transport.name} failed: ${err}\n`);
        }
      }
    }
  }
}

export const recorder = LogManager.getInstance();
