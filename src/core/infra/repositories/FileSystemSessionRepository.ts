import { Config } from '../../config/Config';
import { ISessionRepository } from '../../domain/IRepository';
import { Session } from '../../session/Session';
import { BaseJsonRepository } from '@supernova/storage/base/BaseJsonRepository';
import path from 'path';

export class FileSystemSessionRepository extends BaseJsonRepository<ReturnType<Session['toJSON']>> implements ISessionRepository {
    constructor(private readonly config: Config, baseDir: string) {
        super(baseDir);
    }

    public async initialize(): Promise<void> { }
    public async start(): Promise<void> { }
    public async stop(): Promise<void> { }

    protected getFilePath(sessionId: string): string {
        return path.join(this['baseDir'], sessionId, 'session.json');
    }

    public async save(session: Session): Promise<void> {
        await this.writeJson(this.getFilePath(session.id), session.toJSON());
    }

    public async load(sessionId: string): Promise<Session | null> {
        const data = await this.readJson(this.getFilePath(sessionId));
        return data ? Session.fromJSON(data) : null;
    }

    public async delete(sessionId: string): Promise<void> {
        // ... (can be implemented later or use fs.rm)
    }

    public async list(): Promise<string[]> {
        return [];
    }

    public async exists(sessionId: string): Promise<boolean> {
        const data = await this.readJson(this.getFilePath(sessionId));
        return data !== null;
    }
}
