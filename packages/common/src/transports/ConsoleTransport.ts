import { ILogEntry, ILogTransport, LogLevel } from '../LogManager';

/**
 * ConsoleTransport
 * 將日誌輸出到控制台，支援根據等級著色（選用）與格式化。
 */
export class ConsoleTransport implements ILogTransport {
  public name = 'ConsoleTransport';
  
  constructor(
    public level: LogLevel = 'INFO',
    public prefix: string = ''
  ) {}

  send(entry: ILogEntry): void {
    const timestamp = entry.timestamp.split('T')[1].split('.')[0]; // 簡化時間顯示
    const sessionInfo = entry.session_id ? ` [Session: ${entry.session_id}]` : '';
    const traceInfo = entry.trace_id ? ` [Trace: ${entry.trace_id}]` : '';
    const spanInfo = entry.span_id ? ` [Span: ${entry.span_id}]` : '';
    const typeInfo = `[${entry.type}]`;
    const prefixStr = this.prefix ? `${this.prefix} ` : entry.name ? `[${entry.name}] ` : '';
    
    const formattedMessage = `[${timestamp}] [${entry.level}] ${typeInfo}${sessionInfo}${traceInfo}${spanInfo} ${prefixStr}${entry.message}`;

    switch (entry.level) {
      case 'DEBUG':
        console.debug(formattedMessage);
        break;
      case 'INFO':
        console.log(formattedMessage);
        // 如果是結果類型的日誌，額外印出 payload 以便在控制台看到工具產出
        if (entry.type === 'RESULT' && entry.payload) {
          console.log('   └─ Result:');
          console.dir(entry.payload.result || entry.payload, { depth: 4, colors: true });
        }
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      case 'ERROR':
        console.error(formattedMessage);
        if (entry.payload) console.error(entry.payload);
        break;
    }
  }
}
