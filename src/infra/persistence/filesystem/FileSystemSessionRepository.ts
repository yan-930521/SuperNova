import { mapStoredMessagesToChatMessages } from '@langchain/core/messages';
import fs from 'node:fs/promises';
import path from 'node:path';

import { recorder } from '../../LogManager';
import { MessageDTO, SessionDTO } from '../../types/session';
import { ISessionRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';

/**
 * FileSystemSessionRepository (分層儲存版)
 * 儲存結構：
 * baseDir/<id>/data.json    - 會話元數據 (排除 history)
 * baseDir/<id>/history.jsonl - 會話對話日誌 (JSON Lines)
 */
export class FileSystemSessionRepository
  extends BaseFileSystemRepository<SessionDTO>
  implements ISessionRepository<SessionDTO, MessageDTO> {
  constructor(baseDir: string) {
    super(baseDir, 'SessionRepo');
  }

  /**
   * 確保會話目錄存在並返回路徑
   */
  private async ensureSessionDir(id: string): Promise<string> {
    const sessionDir = path.join(this.baseDir, id);
    await fs.mkdir(sessionDir, { recursive: true });
    return sessionDir;
  }

  /**
   * 重寫保存邏輯：實作元數據與歷史的分離儲存
   */
  async save(session: SessionDTO): Promise<void> {
    const sessionDir = await this.ensureSessionDir(session.id);
    const dataPath = path.join(sessionDir, 'data.json');

    try {
      // 1. 分離數據，只存元數據到 data.json
      const { history, ...metadata } = session;
      await fs.writeFile(dataPath, JSON.stringify(metadata, null, 2), 'utf-8');

      // 2. 如果 history 有內容且 history.jsonl 不存在，則初始化它
      const historyPath = path.join(sessionDir, 'history.jsonl');
      try {
        await fs.access(historyPath);
      } catch {
        if (history && history.length > 0) {
          const jsonl = history.map(h => JSON.stringify({
            message: (h.message as any).toDict ? (h.message as any).toDict() : h.message,
            identity: h.identity
          })).join('\n') + '\n';
          await fs.writeFile(historyPath, jsonl, 'utf-8');
        }
      }
      recorder.debug(`[SessionRepo] Saved session metadata: ${session.id}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[SessionRepo] Failed to save session: ${session.id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * 重寫載入邏輯：整合元數據與 JSONL 歷史，並將 StoredMessage 還原為實例
   */
  async load(id: string): Promise<SessionDTO | null> {
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
              const raw = JSON.parse(line);
              // 將儲存的 JSON 訊息對象還原為 LangChain 的 BaseMessage 實例
              const chatMessages = mapStoredMessagesToChatMessages([raw.message]);
              return {
                message: chatMessages[0],
                identity: raw.identity
              } as MessageDTO;
            } catch {
              return null;
            }
          })
          .filter((item): item is MessageDTO => item !== null);
      } catch {
        session.history = [];
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * 僅附加一條訊息到 history.jsonl (效能優化資產保留)
   */
  async appendMessage(id: string, message: MessageDTO): Promise<void> {
    const sessionDir = await this.ensureSessionDir(id);
    const historyPath = path.join(sessionDir, 'history.jsonl');

    try {
      const line = JSON.stringify({
        message: message.message.toDict(),
        identity: message.identity
      }) + '\n';
      await fs.appendFile(historyPath, line, 'utf-8');
      recorder.debug(`[SessionRepo] Appended message to session: ${id}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[SessionRepo] Failed to append message to session: ${id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
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
        const session = await this.load(dirName);
        if (session && session.userId === userId) {
          sessions.push(session);
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * 重寫列表邏輯：列出所有會話目錄名稱
   */
  async list(): Promise<string[]> {
    try {
      const dirs = await fs.readdir(this.baseDir, { withFileTypes: true });
      return dirs
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch {
      return [];
    }
  }

  /**
   * 重寫刪除邏輯：刪除整個資料夾
   */
  async delete(id: string): Promise<void> {
    const sessionDir = path.join(this.baseDir, id);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      recorder.info(`[SessionRepo] Deleted session folder: ${id}`, { type: 'SYSTEM' });
    } catch (error) {
      recorder.error(`[SessionRepo] Failed to delete session folder: ${id}`, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }
}
