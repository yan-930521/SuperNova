import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSystemAgentRepository } from '../../src/infra/storage/FileSystemAgentRepository';
import { AgentDTO } from '../../src/infra/types/agent';

describe('FileSystemAgentRepository', () => {
  let tempDir: string;
  let repository: FileSystemAgentRepository;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `supernova-agent-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    repository = new FileSystemAgentRepository(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const mockAgent: AgentDTO = {
    id: 'researcher-01',
    role: 'Researcher',
    identity: 'Expert researcher',
    capabilities: ['search', 'analyze'],
    modelPreset: 'smart',
    config: {}
  };

  test('should save and find an agent by id', async () => {
    await repository.save(mockAgent);
    const found = await repository.findById('researcher-01');
    expect(found).toEqual(mockAgent);
  });

  test('should return null if agent not found', async () => {
    const found = await repository.findById('non-existent');
    expect(found).toBeNull();
  });

  test('should find all agents', async () => {
    const agent1 = { ...mockAgent, id: 'agent-1' };
    const agent2 = { ...mockAgent, id: 'agent-2' };

    await repository.save(agent1);
    await repository.save(agent2);

    const allAgents = await repository.findAll();
    expect(allAgents).toHaveLength(2);
    expect(allAgents).toContainEqual(agent1);
    expect(allAgents).toContainEqual(agent2);
  });
});
