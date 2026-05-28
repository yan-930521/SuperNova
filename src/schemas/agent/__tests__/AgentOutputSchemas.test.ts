import { describe, expect, it } from 'bun:test';
import { ReplanResponseSchema } from '../AgentOutputSchemas';

describe('ReplanResponseSchema', () => {
    it('validates a correct replan response', () => {
        const validData = {
            addedNodes: [
                { id: 'task_new', type: 'code', goal: 'Fix the bug', assignedAgentId: null, assignedRole: 'coder', dependencies: ['task_1'] }
            ],
            modifiedNodes: [
                { id: 'task_2', goal: 'Updated goal' }
            ],
            removedEdges: [
                { source: 'task_1', target: 'task_2' }
            ]
        };

        const result = ReplanResponseSchema.safeParse(validData);
        expect(result.success).toBe(true);
    });

    it('rejects invalid missing required arrays', () => {
        const invalidData = {
            addedNodes: []
        };
        const result = ReplanResponseSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });
});
