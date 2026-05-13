import { CoordinatorAgent } from '../src/agent/CoordinatorAgent';
import { TaskPlanEngine } from '../src/agent/TaskPlanEngine';
import { ModelRegistry, InferenceEngine } from '../src/runtime/ModelRegistry';
import { ModelPreset } from '../interfaces/runtime/IModelRegistry';
import { ChatOpenAI } from '@langchain/openai';
import { ThoughtEvalResponseSchema, TaskExpandResponseSchema } from '../src/schemas/agent/AgentOutputSchemas';
import type { IMutationRequest } from '../interfaces/models/IMutationRequest';
import type { ITaskPlanEngine, ITaskNode } from '../interfaces/agent/ITaskPlanEngine';
import type { IAgentState } from '../interfaces/agent/IAgentState';

describe('Coordinator Theme Tests', () => {

  describe('CoordinatorAgent Logic', () => {
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
          mutation_type: 'UPDATE',
          proposed_change: { val: 1 },
          priority: 10,
          version_ref: 'v1'
        },
        {
          requester_id: 'agent-2',
          target_hook: 'hook-A',
          mutation_type: 'UPDATE',
          proposed_change: { val: 2 },
          priority: 20, // Higher priority wins
          version_ref: 'v1'
        }
      ];

      const result = await coordinator.arbitrateMutations(proposals);
      expect(result).toHaveLength(1);
      expect(result[0].requester_id).toBe('agent-2');
    });

    test('should request replan from engine and return updated task graph', async () => {
      const mockTaskGraph = {
        nodes: [
          { id: 'task-1', goal: 'Replanned Task', type: 'worker', dependencies: [], status: 'pending' as const }
        ],
        milestones: ['M1'],
        currentMilestoneIndex: 0
      };

      const mockPlanEngine: ITaskPlanEngine = {
        planMilestones: jest.fn(),
        expandMilestone: jest.fn(),
        reviewAndProject: jest.fn(),
        run: jest.fn(),
        replan: jest.fn().mockResolvedValue({
          planning: {
            taskGraph: mockTaskGraph
          }
        })
      };

      const coordinatorWithEngine = new CoordinatorAgent(mockPlanEngine);
      await coordinatorWithEngine.initFromJSON({ id: 'coord-1', role: 'coordinator' });

      const currentState: any = { goal: 'Test Goal', planning: { taskGraph: { nodes: [] } } };
      const result = await coordinatorWithEngine.requestReplan('Test Goal', 'task-0', 'Some error', currentState);

      expect(mockPlanEngine.replan).toHaveBeenCalledWith(currentState, 'task-0', 'Some error');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].goal).toBe('Replanned Task');
    });
  });

  describe('CoordinatorPlanningIntegration (Mocked)', () => {
    let mockSmartInference: jest.Mocked<any>;
    let mockEvalInference: jest.Mocked<any>;
    let mockModelRegistry: jest.Mocked<any>;
    let coordinator: CoordinatorAgent;
    let planEngine: TaskPlanEngine;

    beforeEach(async () => {
      mockSmartInference = { infer: jest.fn() };
      mockEvalInference = { infer: jest.fn() };
      mockModelRegistry = {
        getModel: jest.fn((preset) => {
          if (preset === ModelPreset.SMART) return mockSmartInference;
          if (preset === ModelPreset.EVAL) return mockEvalInference;
          throw new Error('Not found');
        }),
        registerModel: jest.fn()
      };

      planEngine = new TaskPlanEngine(mockModelRegistry);
      coordinator = new CoordinatorAgent(planEngine);
      await coordinator.initFromJSON({ id: 'test-coordinator', role: 'COORDINATOR' });
    });

    it('should generate a valid ITaskGraph through the full planning flow', async () => {
      const goal = "Build a simple web app";

      mockSmartInference.infer.mockResolvedValueOnce({ milestones: ["Design UI", "Implement Backend"] });
      mockEvalInference.infer.mockResolvedValueOnce({ score: 8, rationale: "Good milestones" });
      mockSmartInference.infer.mockResolvedValueOnce({ expected_output: "A working UI and API" });
      mockSmartInference.infer.mockResolvedValueOnce({
        nodes: [
          { id: "task-1", type: "research", goal: "Research UI frameworks", dependencies: [] },
          { id: "task-2", type: "coding", goal: "Implement UI with React", dependencies: ["task-1"] }
        ]
      });

      const runtimeGraph = await coordinator.planTaskGraph(goal);

      expect(runtimeGraph.nodes).toHaveLength(2);
      expect(runtimeGraph.nodes[0].goal).toBe("Research UI frameworks");
      expect(runtimeGraph.nodes[1].dependencies).toContain("task-1");
    });
  });

  describe('TaskPlanEngine.replan', () => {
    let mockSmartInference: jest.Mocked<any>;
    let mockModelRegistry: jest.Mocked<any>;
    let planEngine: TaskPlanEngine;

    beforeEach(() => {
      mockSmartInference = { infer: jest.fn() };
      mockModelRegistry = {
        getModel: jest.fn().mockReturnValue(mockSmartInference),
        registerModel: jest.fn()
      };
      planEngine = new TaskPlanEngine(mockModelRegistry);
    });

    it('should update state with replanned nodes', async () => {
      const initialState: IAgentState = {
        goal: "Test Goal",
        planning: {
          milestones: ["M1"],
          currentMilestoneIdx: 0,
          taskGraph: {
            nodes: [{ id: "task-1", type: "work", goal: "Task 1", dependencies: [], status: "failed" }],
            milestones: ["M1"],
            currentMilestoneIndex: 0
          }
        },
        messages: [],
        lastEvaluations: [],
        errors: [],
        metadata: { agentId: 'test', role: 'worker' },
        thoughtTree: { nodes: [], iterationCount: 0, rootId: null, activeNodeId: null }
      } as any;

      mockSmartInference.infer.mockResolvedValueOnce({
        nodes: [{ id: "task-1-retry", type: "work", goal: "Retry Task 1", dependencies: [] }]
      });

      const result = await planEngine.replan(initialState, "task-1", "Timeout error");

      expect(result.planning?.taskGraph?.nodes).toHaveLength(1);
      expect(result.planning?.taskGraph?.nodes?.[0].id).toBe("task-1-retry");
      expect(result.planning?.taskGraph?.nodes?.[0].status).toBe("pending");
    });
  });

  describe('Real Planning Integration', () => {
    // 僅在有 API Key 且開啟開關時執行
    if (process.env.OPENAI_API_KEY && process.env.SUPERNOVA_RUN_REAL_LLM === 'true') {
      let modelRegistry: ModelRegistry;
      let planEngine: TaskPlanEngine;
      let coordinator: CoordinatorAgent;

      beforeAll(async () => {
        modelRegistry = new ModelRegistry();
        const inference = new InferenceEngine(new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }));
        modelRegistry.registerModel(ModelPreset.SMART, inference);
        modelRegistry.registerModel(ModelPreset.EVAL, inference);
        planEngine = new TaskPlanEngine(modelRegistry);
        coordinator = new CoordinatorAgent(planEngine);
        await coordinator.initFromJSON({ id: 'real-coord', role: 'COORDINATOR' });
      });

      it('should generate a valid task graph from a real goal', async () => {
        const goal = "Write a hello world program in Python";
        const graph = await coordinator.planTaskGraph(goal);
        expect(graph.nodes.length).toBeGreaterThan(0);
        expect(graph.nodes[0].goal).toBeDefined();
      }, 60000);
    } else {
      it.skip('skipping real inference test (no API Key)', () => {});
    }
  });
});
