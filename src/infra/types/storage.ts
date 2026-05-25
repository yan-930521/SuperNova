export interface ISession {
  id: string;
  userId: string;
  goal: string;
  status: 'ACTIVE' | 'ARCHIVED';
  summary?: string;
}

export interface ISessionRepository {
  create(userId: string, goal: string): Promise<ISession>;
  findById(id: string): Promise<ISession | null>;
  findByUser(userId: string): Promise<ISession[]>;
  update(session: ISession): Promise<void>;
}
