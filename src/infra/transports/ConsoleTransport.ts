import { ILogEntry, ILogTransport, LogLevel } from '../../../interfaces/infra/ILogger';

/**
 * ConsoleTransport
 * 將日誌輸出到控制台，支援根據等級著色（選用）與格式化。
 */
export class ConsoleTransport implements ILogTransport {
  public name = 'ConsoleTransport';
  
  constructor(public level: LogLevel = 'INFO') {}

  send(entry: ILogEntry): void {
    const timestamp = entry.timestamp.split('T')[1].split('.')[0]; // 簡化時間顯示
    const sessionInfo = entry.session_id ? `[Session: ${entry.session_id}]` : '';
    const typeInfo = `[${entry.type}]`;
    
    const formattedMessage = `[${timestamp}] [${entry.level}] ${typeInfo} ${sessionInfo} ${entry.message}`;

    switch (entry.level) {
      case 'DEBUG':
        console.debug(formattedMessage);
        break;
      case 'INFO':
        console.log(formattedMessage);
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
