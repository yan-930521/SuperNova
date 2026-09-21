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

  private writeQueue: Record<string, string[]> = {};
  private isFlushing: Record<string, boolean> = {};

  private async flush(filePath: string) {
    if (this.isFlushing[filePath]) return;
    this.isFlushing[filePath] = true;
    
    while (this.writeQueue[filePath] && this.writeQueue[filePath].length > 0) {
      const batch = this.writeQueue[filePath].join('');
      this.writeQueue[filePath] = [];
      try {
        await fs.promises.appendFile(filePath, batch, 'utf8');
      } catch (err) {
        process.stderr.write(`[FileTransport] Failed to write log: ${err}\n`);
      }
    }
    
    this.isFlushing[filePath] = false;
  }

  private enqueue(filePath: string, line: string) {
    if (!this.writeQueue[filePath]) {
        this.writeQueue[filePath] = [];
    }
    this.writeQueue[filePath].push(line);
    this.flush(filePath);
  }

  send(entry: ILogEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n';
      
      if (this.logFileName) {
        this.enqueue(path.join(this.logDir, this.logFileName), line);
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const dailyFilePath = path.join(this.logDir, `${dateStr}.jsonl`);
      this.enqueue(dailyFilePath, line);

      if (entry.session_id) {
        const sessionFilePath = path.join(this.logDir, `${entry.session_id}.jsonl`);
        this.enqueue(sessionFilePath, line);
      }
    } catch (err) {
      process.stderr.write(`[FileTransport] Failed to enqueue log: ${err}\n`);
    }
  }
}
