import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ISessionRepository } from '../IRepository';
import { Session } from '../../../session/Session';
import { LogManager } from '../../LogManager';

/**
 * FileSystemSessionRepository
 * 基於本地檔案系統的會話儲存庫實現，所有資料存放在 `workspace/session/{sessionId}/session.json`
 */
export class FileSystemSessionRepository implements ISessionRepository {
  private readonly logger = LogManager.recorder;
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  public async initialize(): Promise<void> {
    this.logger.info(`[SessionRepository] Initializing session storage base directory: ${this.baseDir}`);
    if (!existsSync(this.baseDir)) {
      await fs.mkdir(this.baseDir, { recursive: true });
    }
  }

  public async start(): Promise<void> {}
  public async stop(): Promise<void> {}

  public async save(entity: Session): Promise<void> {
    const sessionDir = path.join(this.baseDir, entity.id);
    const sessionFilePath = path.join(sessionDir, 'session.json');

    try {
      if (!existsSync(sessionDir)) {
        await fs.mkdir(sessionDir, { recursive: true });
      }

      const data = JSON.stringify(entity.toJSON(), null, 2);
      await fs.writeFile(sessionFilePath, data, 'utf-8');
      this.logger.debug(`[SessionRepository] Session ${entity.id} saved successfully`);
    } catch (err: any) {
      this.logger.error(`[SessionRepository] Failed to save session ${entity.id}: ${err.message}`);
      throw err;
    }
  }

  public async load(id: string): Promise<Session | null> {
    const sessionFilePath = path.join(this.baseDir, id, 'session.json');

    if (!existsSync(sessionFilePath)) {
      this.logger.debug(`[SessionRepository] Session file not found: ${sessionFilePath}`);
      return null;
    }

    try {
      const content = await fs.readFile(sessionFilePath, 'utf-8');
      const data = JSON.parse(content);
      return Session.fromJSON(data);
    } catch (err: any) {
      this.logger.error(`[SessionRepository] Failed to load session ${id}: ${err.message}`);
      throw err;
    }
  }

  public async delete(id: string): Promise<void> {
    const sessionDir = path.join(this.baseDir, id);
    if (existsSync(sessionDir)) {
      try {
        await fs.rm(sessionDir, { recursive: true, force: true });
        this.logger.info(`[SessionRepository] Deleted session directory: ${sessionDir}`);
      } catch (err: any) {
        this.logger.error(`[SessionRepository] Failed to delete session ${id}: ${err.message}`);
        throw err;
      }
    }
  }

  public async list(): Promise<string[]> {
    try {
      if (!existsSync(this.baseDir)) return [];
      const dirs = await fs.readdir(this.baseDir);
      const sessionIds: string[] = [];

      for (const dirName of dirs) {
        const sessionFilePath = path.join(this.baseDir, dirName, 'session.json');
        if (existsSync(sessionFilePath)) {
          sessionIds.push(dirName);
        }
      }

      return sessionIds;
    } catch (err: any) {
      this.logger.error(`[SessionRepository] Failed to list sessions: ${err.message}`);
      throw err;
    }
  }

  public async exists(id: string): Promise<boolean> {
    const sessionFilePath = path.join(this.baseDir, id, 'session.json');
    return existsSync(sessionFilePath);
  }
}
