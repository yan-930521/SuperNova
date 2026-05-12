import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseSession } from '../../src/session/BaseSession';
import { FileSnapshotManager } from '../../src/infra/FileSnapshotManager';
import { AgentRegistry } from '../../src/infra/AgentRegistry';
import { BaseAgent } from '../../src/agent/BaseAgent';

describe('Snapshot and Rollback Integration', () => {
  const testStorageDir = path.join(process.cwd(), '.test-integration-snapshots');
  let snapshotManager: FileSnapshotManager;
  let agentRegistry: AgentRegistry;

  beforeEach(async () => {
    snapshotManager = new FileSnapshotManager(testStorageDir);
    agentRegistry = new AgentRegistry();
    if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    }
  });

  it('should auto-snapshot and support manual rollback with agent state', async () => {
    // 1. Setup Session and Agents
    const session = new BaseSession('test-session', 'Initial Goal');
    session.snapshotManager = snapshotManager;
    session.agentRegistry = agentRegistry;

    const agent = new BaseAgent();
    await agent.initFromJSON({ id: 'agent-1', role: 'worker', state: { step: 0 } });
    agentRegistry.register(agent);
    session.addAgent('agent-1');

    session.taskGraph.addTask('Task1', { data: 'A' });
    session.taskGraph.addTask('Task2', { data: 'B' });
    session.taskGraph.addDependency('Task1', 'Task2');

    // 2. Execute Task 1 (should trigger snapshot)
    await session.tick();
    
    // Verify Task 1 is completed and snapshot exists
    expect(session.taskGraph.getReadyTasks()).toEqual(['Task2']);
    const snapshotId = await snapshotManager.getLatestSnapshotId('test-session');
    expect(snapshotId).toBeDefined();

    // 3. Modify state manually (Simulate unexpected change)
    await agent.initFromJSON({ state: { step: 1, corrupted: true } });
    session.status = 'ERROR';
    
    // 4. Rollback to Snapshot 1
    await session.rollback(snapshotId!);

    // 5. Verify restored state
    expect(session.status).toBe('IDLE');
    expect(session.taskGraph.getReadyTasks()).toEqual(['Task2']);
    
    const restoredAgent = agentRegistry.getAgent('agent-1') as BaseAgent;
    const restoredJson = restoredAgent.toJSON();
    expect(restoredJson.state.corrupted).toBeUndefined();
    expect(restoredJson.state.step).toBe(0);

    // 6. Execute Task 2 (after rollback)
    await session.tick();
    expect(session.taskGraph.getReadyTasks()).toEqual([]);
    const secondSnapshotId = await snapshotManager.getLatestSnapshotId('test-session');
    expect(secondSnapshotId).not.toBe(snapshotId);
  });
});
