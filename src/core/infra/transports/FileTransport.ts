import * as fs from 'fs';
import * as path from 'path';
import { ILogEntry, ILogTransport, LogLevel } from '../LogManager';

/**
 * FileTransport
 * 純粹的檔案傳輸器。不包含任何業務邏輯，給定目錄就寫檔。
 * - 系統全域日誌會寫入 workspace/logs/YYYY-MM-DD.jsonl
 * - Agent 的 Oplog 初始化時可以傳入自訂的 logFileName (例如 .oplog.jsonl) 與專屬目錄
 */
export class FileTransport implements ILogTransport {
  public name = 'FileTransport';
  private logDir: string;
  private logFileName?: string;

  constructor(public level: LogLevel = 'DEBUG', customLogDir?: string, customLogFileName?: string) {
    this.logDir = customLogDir || path.join(process.cwd(), 'workspace', 'logs');
    this.logFileName = customLogFileName;
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
      
      // 如果有指定明確的檔名 (例如 Agent 的 .oplog.jsonl)
      if (this.logFileName) {
        fs.appendFileSync(path.join(this.logDir, this.logFileName), line, 'utf8');
        return;
      }

      // 否則寫入當天全量日誌 (系統全域行為)
      const dateStr = new Date().toISOString().split('T')[0];
      const dailyFilePath = path.join(this.logDir, `${dateStr}.jsonl`);
      fs.appendFileSync(dailyFilePath, line, 'utf8');

      // 如果有 session_id，額外保留對 session 的追蹤
      if (entry.session_id) {
        const sessionFilePath = path.join(this.logDir, `${entry.session_id}.jsonl`);
        fs.appendFileSync(sessionFilePath, line, 'utf8');
      }
    } catch (err) {
      process.stderr.write(`[FileTransport] Failed to write log: ${err}\n`);
    }
  }
}
