/**
 * 日誌等級定義
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * 日誌條目結構 (JSONL 格式基準)
 */
export interface ILogEntry {
  timestamp: string;      // ISO8601
  level: LogLevel;
  type: string;           // 業務類型：'SYSTEM', 'THOUGHT', 'TOOL', 'PLAN', 'MUTATION', 'LIFECYCLE'
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
 * 統一日誌管理器接口
 */
export interface ILogger {
  debug(message: string, context?: Partial<ILogEntry>): void;
  info(message: string, context?: Partial<ILogEntry>): void;
  warn(message: string, context?: Partial<ILogEntry>): void;
  error(message: string, context?: Partial<ILogEntry>): void;
  
  /** 增加傳輸器 (如 Console, File) */
  addTransport(transport: ILogTransport): void;
}
