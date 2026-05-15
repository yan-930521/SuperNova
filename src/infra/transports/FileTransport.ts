import * as fs from 'fs';
import * as path from 'path';
import { ILogEntry, ILogTransport, LogLevel } from '../../../interfaces/infra/ILogger';

/**
 * FileTransport
 * 將所有日誌以 JSONL 格式寫入 workspace/logs/ 目錄。
 */
export class FileTransport implements ILogTransport {
  public name = 'FileTransport';
  private logDir: string;

  constructor(public level: LogLevel = 'DEBUG', customLogDir?: string) {
    this.logDir = customLogDir || path.join(process.cwd(), 'workspace', 'logs');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  send(entry: ILogEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n';
      
      // 1. 寫入當天全量日誌 (格式: YYYY-MM-DD.jsonl)
      const dateStr = new Date().toISOString().split('T')[0];
      const dailyFilePath = path.join(this.logDir, `${dateStr}.jsonl`);
      fs.appendFileSync(dailyFilePath, line, 'utf8');

      // 2. 如果有 session_id，則額外寫入 Session 專屬日誌
      if (entry.session_id) {
        const sessionFilePath = path.join(this.logDir, `${entry.session_id}.jsonl`);
        fs.appendFileSync(sessionFilePath, line, 'utf8');
      }
    } catch (err) {
      process.stderr.write(`[FileTransport] Failed to write log: ${err}\n`);
    }
  }
}
