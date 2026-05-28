import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { ChainStatus, ITaskRepository, TaskStatus } from '../../src/infra/types/task';
import { AgentManager } from '../../src/manager/AgentManager';
import { TaskManager } from '../../src/manager/TaskManager';
import { GlobalRuntime } from '../../src/runtime/GlobalRuntime';
import { TaskPlanner } from '../../src/task/TaskPlanner';

describe("Self-Healing Integration Test", () => {
    let taskManager: TaskManager;
    let agentManager: AgentManager;
    let mockRepo: ITaskRepository;
    let mockPlanner: any;

    beforeEach(() => {
        // 0. Mock ModelRegistry
        const mockModelRegistry = {
            getModel: mock(() => ({
                withSystemPrompt: mock(() => ({
                    infer: mock()
                }))
            }))
        };
        (GlobalRuntime.getInstance() as any).modelRegistry = mockModelRegistry;

        // 1. Mock Repository
        mockRepo = {
            save: mock(async () => {}),
            findById: mock(async () => null)
        };

        // 2. Setup Managers
        agentManager = new AgentManager({} as any); // Minimal setup
        taskManager = new TaskManager(agentManager, mockRepo);

        // 3. Mock Planner
        mockPlanner = {
            run: mock(async () => ({
                planning: {
                    taskGraph: { nodes: [{ id: 'task_1', goal: 'Initial Goal', status: 'pending', dependencies: [] }] },
                    milestones: ['Milestone 1'],
                    currentMilestoneIdx: 0
                }
            })),
            replan: mock(async () => ({
                addedNodes: [],
                modifiedNodes: [{ id: 'task_1', goal: 'Recovered Goal' }],
                removedEdges: []
            })),
            expandMilestone: mock(async () => ({ planning: { taskGraph: { nodes: [] } } }))
        };

        (taskManager as any).planner = mockPlanner;

        // 4. Mock Agent
        const mockAgent = {
            id: 'default-worker',
            role: 'worker',
            capabilities: ['work'],
            execute: mock()
        };
        (agentManager as any).agents.set('default-worker', mockAgent);

        // Start Pulse Engine
        GlobalRuntime.getInstance().pulseEngine.start();
    });

    afterEach(() => {
        GlobalRuntime.getInstance().pulseEngine.stop();
    });

    test("should retry task 3 times then trigger re-plan", async () => {
        const mockAgent = agentManager.getAgent('default-worker') as any;
        
        // Make agent fail
        mockAgent.execute.mockImplementation(async () => {
            return { status: 'failed', error: 'Simulated failure' };
        });

        // Submit task
        const { chainId } = await taskManager.submit("Testing goal", "session_1", "user_1");

        // Give it time to process and retry
        // 3 retries + 1 initial try = 4 failures
        // Then 1 replan
        // Then 3 retries on the NEW goal...
        // Let's wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));

        const chain = (taskManager as any).chains.get(chainId);
        
        // Verify retries happened
        const task = (taskManager as any).activeTasks.get('task_1');
        expect(task.retryCount).toBeGreaterThan(0);
        
        // Verify replan was called
        expect(mockPlanner.replan).toHaveBeenCalled();
        
        // After replan, the goal should be updated
        expect(task.goal).toBe('Recovered Goal');
    });

    test("should mark as STUCK after 3 failed re-plans", async () => {
        const mockAgent = agentManager.getAgent('default-worker') as any;
        mockAgent.execute.mockImplementation(async () => {
            return { status: 'failed', error: 'Fatal failure' };
        });

        // Mock replan to always return the same failing task
        mockPlanner.replan.mockImplementation(async () => ({
            addedNodes: [],
            modifiedNodes: [{ id: 'task_1', goal: 'Failing Again' }],
            removedEdges: []
        }));

        const { chainId } = await taskManager.submit("Testing fatal", "session_2", "user_2");

        // Wait for multiple re-plan cycles
        await new Promise(resolve => setTimeout(resolve, 500));

        const chain = (taskManager as any).chains.get(chainId);
        expect(chain.status).toBe(ChainStatus.STUCK);
        expect(chain.replanCount).toBe(3);
    });
});
