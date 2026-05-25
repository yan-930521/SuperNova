export interface SessionDTO {
  id: string;
  userId: string;
  responsibleAgentId: string;
  goal: string;
  status: string; // IDLE | RUNNING | COMPLETED | INTERRUPTED | CRASHED
  history: any[]; // Stores serialized LangChain messages
  metadata: Record<string, any>;
}

export interface ISessionRepository {
  save(session: SessionDTO): Promise<void>;
  findById(id: string): Promise<SessionDTO | null>;
  findByUser(userId: string): Promise<SessionDTO[]>;
}
