import { CoordinatorAgent } from '../../src/agent/CoordinatorAgent';
import { IMutationRequest } from '../../interfaces/models/IMutationRequest';

describe('CoordinatorAgent', () => {
  let coordinator: CoordinatorAgent;

  beforeEach(async () => {
    coordinator = new CoordinatorAgent();
    await coordinator.initFromJSON({ id: 'coord-1', role: 'coordinator' });
  });

  test('should arbitrate conflicts by priority', async () => {
    const proposals: IMutationRequest[] = [
      {
        requester_id: 'agent-1',
        target_hook: 'hook-A',
        proposed_change: { val: 1 },
        priority: 10,
        version_ref: 'v1'
      },
      {
        requester_id: 'agent-2',
        target_hook: 'hook-A',
        proposed_change: { val: 2 },
        priority: 20, // Higher priority wins
        version_ref: 'v1'
      }
    ];

    const result = await coordinator.arbitrateMutations(proposals);
    expect(result).toHaveLength(1);
    expect(result[0].requester_id).toBe('agent-2');
  });

  test('should arbitrate conflicts by order if priority is same', async () => {
    const proposals: IMutationRequest[] = [
      {
        requester_id: 'agent-1',
        target_hook: 'hook-A',
        proposed_change: { val: 1 },
        priority: 10,
        version_ref: 'v1'
      },
      {
        requester_id: 'agent-2',
        target_hook: 'hook-A',
        proposed_change: { val: 2 },
        priority: 10, // Same priority, earlier wins
        version_ref: 'v1'
      }
    ];

    const result = await coordinator.arbitrateMutations(proposals);
    expect(result).toHaveLength(1);
    expect(result[0].requester_id).toBe('agent-1');
  });

  test('should allow multiple proposals for different hooks', async () => {
    const proposals: IMutationRequest[] = [
      {
        requester_id: 'agent-1',
        target_hook: 'hook-A',
        proposed_change: { val: 1 },
        priority: 10,
        version_ref: 'v1'
      },
      {
        requester_id: 'agent-2',
        target_hook: 'hook-B',
        proposed_change: { val: 2 },
        priority: 10,
        version_ref: 'v1'
      }
    ];

    const result = await coordinator.arbitrateMutations(proposals);
    expect(result).toHaveLength(2);
  });
});
