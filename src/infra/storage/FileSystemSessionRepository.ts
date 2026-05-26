import * as fs from 'fs/promises';
import * as path from 'path';

import { ISessionRepository, MessageDTO, SessionDTO } from '../types/session';

/**
 * FileSystemSessionRepository (分層存儲版)
 * 儲存結構：
 * baseDir/<id>/data.json    - 會話元數據 (排除 history)
 * baseDir/<id>/history.jsonl - 會話對話日誌 (JSON Lines)
 */
export class FileSystemSessionRepository implements ISessionRepository {
  constructor(private baseDir: string) { }

  /**
   * 確保目錄存在
   */
  private async ensureSessionDir(id: string): Promise<string> {
    const sessionDir = path.join(this.baseDir, id);
    await fs.mkdir(sessionDir, { recursive: true });
    return sessionDir;
  }

  /**
   * 保存或更新會話元數據 (data.json)
   */
  async save(session: SessionDTO): Promise<void> {
    const sessionDir = await this.ensureSessionDir(session.id);
    const dataPath = path.join(sessionDir, 'data.json');

    // 分離數據，只存元數據到 data.json
    const { history, ...metadata } = session;
    await fs.writeFile(dataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // 如果 history 有內容且 history.jsonl 不存在，則初始化它
    const historyPath = path.join(sessionDir, 'history.jsonl');
    try {
      await fs.access(historyPath);
    } catch {
      if (history && history.length > 0) {
        const jsonl = history.map(h => JSON.stringify(h)).join('\n') + '\n';
        await fs.writeFile(historyPath, jsonl, 'utf-8');
      }
    }
  }

  /**
   * 僅附加一條訊息到 history.jsonl (效能優化)
   */
  async appendMessage(id: string, message: MessageDTO): Promise<void> {
    const sessionDir = await this.ensureSessionDir(id);
    const historyPath = path.join(sessionDir, 'history.jsonl');

    // 使用 append 模式寫入一行
    const line = JSON.stringify({
      message: message.message.toDict(),
      identity: message.identity
    }) + '\n';
    await fs.appendFile(historyPath, line, 'utf-8');
  }

  /**
   * 根據 ID 載入完整會話
   */
  async findById(id: string): Promise<SessionDTO | null> {
    const sessionDir = path.join(this.baseDir, id);
    const dataPath = path.join(sessionDir, 'data.json');
    const historyPath = path.join(sessionDir, 'history.jsonl');

    try {
      // 1. 讀取元數據
      const rawData = await fs.readFile(dataPath, 'utf-8');
      const session = JSON.parse(rawData) as SessionDTO;

      // 2. 讀取歷史紀錄 (JSONL)
      try {
        const rawHistory = await fs.readFile(historyPath, 'utf-8');
        session.history = rawHistory
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch (e) {
              return null;
            }
          })
          .filter(item => item !== null);
      } catch {
        session.history = [];
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * 查找特定用戶的所有會話
   */
  async findByUser(userId: string): Promise<SessionDTO[]> {
    try {
      const dirs = await fs.readdir(this.baseDir);
      const sessions: SessionDTO[] = [];

      for (const dirName of dirs) {
        const fullPath = path.join(this.baseDir, dirName);
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) continue;

        const session = await this.findById(dirName);
        if (session && session.userId === userId) {
          sessions.push(session);
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }
}
