export interface AgentDTO {
  id: string;
  role: string;
  identity: string;
  capabilities: string[];
  modelPreset: 'fast' | 'smart' | 'eval';
  config: Record<string, any>;
}

export interface IAgentRepository {
  findById(id: string): Promise<AgentDTO | null>;
  findAll(): Promise<AgentDTO[]>;
  save(agent: AgentDTO): Promise<void>;
}
