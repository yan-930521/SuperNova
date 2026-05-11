import { SessionManager } from '../../src/infra/SessionManager';
import { BaseSession } from '../../src/session/BaseSession';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('should create a session from JSON', async () => {
    const json = { id: 'test-id', goal: 'test-goal', status: 'IDLE' };
    const session = await manager.createFromJSON(json);

    expect(session).toBeDefined();
    expect(session.id).toBe('test-id');
    expect(session.goal).toBe('test-goal');
    expect(session.status).toBe('IDLE');
    
    const found = manager.getSession('test-id');
    expect(found).toBe(session);
  });

  it('should restore a session from a snapshot', async () => {
    const json = { id: 'snap-id', goal: 'snap-goal', status: 'ACTIVE' };
    const snapshot = JSON.stringify(json);
    const session = await manager.restoreFromSnapshot(snapshot);

    expect(session).toBeDefined();
    expect(session.id).toBe('snap-id');
    expect(manager.getSession('snap-id')).toBe(session);
  });

  it('should maintain multiple independent sessions', async () => {
    await manager.createFromJSON({ id: 's1', goal: 'g1' });
    await manager.createFromJSON({ id: 's2', goal: 'g2' });

    expect(manager.getSession('s1')).toBeDefined();
    expect(manager.getSession('s2')).toBeDefined();
    expect(manager.getSession('s1')).not.toBe(manager.getSession('s2'));
  });

  it('should delete a session', async () => {
    await manager.createFromJSON({ id: 'to-delete', goal: 'none' });
    expect(manager.getSession('to-delete')).toBeDefined();

    manager.deleteSession('to-delete');
    expect(manager.getSession('to-delete')).toBeUndefined();
  });
});
