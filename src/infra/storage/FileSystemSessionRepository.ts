import * as fs from 'fs/promises';
import * as path from 'path';
import { ISession, ISessionRepository } from '../types/storage';

export class FileSystemSessionRepository implements ISessionRepository {
  constructor(private baseDir: string) {}

  async create(userId: string, goal: string): Promise<ISession> {
    const session: ISession = {
      id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      userId,
      goal,
      status: 'ACTIVE'
    };
    await this.update(session);
    return session;
  }

  async findById(id: string): Promise<ISession | null> {
    const filePath = path.join(this.baseDir, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async findByUser(userId: string): Promise<ISession[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      const sessions: ISession[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const data = JSON.parse(await fs.readFile(path.join(this.baseDir, file), 'utf-8'));
        if (data.userId === userId) sessions.push(data);
      }
      return sessions;
    } catch {
      return [];
    }
  }

  async update(session: ISession): Promise<void> {
    const filePath = path.join(this.baseDir, `${session.id}.json`);
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }
}
