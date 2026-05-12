import { IInferenceEngine, IModelRegistry, ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { CoordinatorAgent } from '../../src/agent/CoordinatorAgent';
import { TaskPlanEngine } from '../../src/agent/TaskPlanEngine';
import { IAgentState } from '../../interfaces/agent/IAgentState';
import { z } from 'zod';

describe('CoordinatorPlanningIntegration', () => {
  let mockSmartInference: jest.Mocked<IInferenceEngine>;
  let mockEvalInference: jest.Mocked<IInferenceEngine>;
  let mockModelRegistry: jest.Mocked<IModelRegistry>;
  let coordinator: CoordinatorAgent;
  let planEngine: TaskPlanEngine;

  beforeEach(async () => {
    mockSmartInference = {
      infer: jest.fn()
    };
    mockEvalInference = {
      infer: jest.fn()
    };
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
    await coordinator.initFromJSON({ id: 'test-coordinator' });
  });

  it('should generate a valid runtime DAG through the full planning flow', async () => {
    const goal = "Build a simple web app";

    // 1. Mock planMilestones
    mockSmartInference.infer.mockResolvedValueOnce({
      milestones: ["Design UI", "Implement Backend"]
    });

    // 2. Mock reviewAndProject (Review part)
    mockEvalInference.infer.mockResolvedValueOnce({
      score: 8,
      rationale: "Good milestones"
    });

    // 3. Mock reviewAndProject (Projection part)
    mockSmartInference.infer.mockResolvedValueOnce({
      expected_output: "A working UI and API",
      resource_constraints: "None"
    });

    // 4. Mock expandMilestone
    mockSmartInference.infer.mockResolvedValueOnce({
      nodes: [
        {
          id: "task-1",
          type: "research",
          goal: "Research UI frameworks",
          assignedRole: "researcher",
          dependencies: []
        },
        {
          id: "task-2",
          type: "coding",
          goal: "Implement UI with React",
          assignedRole: "coder",
          dependencies: ["task-1"]
        }
      ]
    });

    const runtimeGraph = await coordinator.planTaskGraph(goal);

    // Verify calls
    expect(mockSmartInference.infer).toHaveBeenCalledTimes(3);
    expect(mockEvalInference.infer).toHaveBeenCalledTimes(1);

    // Verify runtimeGraph structure
    expect(runtimeGraph.nodes).toHaveLength(2);
    expect(runtimeGraph.nodes).toContainEqual(["task-1", expect.objectContaining({ goal: "Research UI frameworks" })]);
    expect(runtimeGraph.nodes).toContainEqual(["task-2", expect.objectContaining({ goal: "Implement UI with React" })]);

    // Verify adjacency list (Successors)
    const adjListMap = new Map(runtimeGraph.adjList);
    expect(adjListMap.get("task-1")).toContain("task-2");
    expect(adjListMap.get("task-2")).toEqual([]);

    // Verify in-degree map
    const inDegreeMap = new Map(runtimeGraph.inDegreeMap);
    expect(inDegreeMap.get("task-1")).toBe(0);
    expect(inDegreeMap.get("task-2")).toBe(1);
  });

  it('should retry planMilestones if review score is too low', async () => {
    const goal = "Build a simple web app";

    // 1. First planMilestones
    mockSmartInference.infer.mockResolvedValueOnce({
      milestones: ["Bad milestone"]
    });

    // 2. Review fails (score 5 < 7)
    mockEvalInference.infer.mockResolvedValueOnce({
      score: 5,
      rationale: "Milestones are too vague"
    });

    // 3. Projection (still called because reviewAndProject does both)
    mockSmartInference.infer.mockResolvedValueOnce({
      expected_output: "...",
      resource_constraints: "..."
    });

    // 4. Second planMilestones (Retry)
    mockSmartInference.infer.mockResolvedValueOnce({
      milestones: ["Better Design", "Better Implementation"]
    });

    // 5. Review passes (score 9)
    mockEvalInference.infer.mockResolvedValueOnce({
      score: 9,
      rationale: "Better now"
    });

    // 6. Second Projection
    mockSmartInference.infer.mockResolvedValueOnce({
      expected_output: "...",
      resource_constraints: "..."
    });

    // 7. expandMilestone
    mockSmartInference.infer.mockResolvedValueOnce({
      nodes: [
        {
          id: "task-1",
          type: "coding",
          goal: "Do it",
          dependencies: []
        }
      ]
    });

    const runtimeGraph = await coordinator.planTaskGraph(goal);

    expect(mockSmartInference.infer).toHaveBeenCalledTimes(5); // plan(1) + proj(2) + plan(3) + proj(4) + expand(5)
    expect(mockEvalInference.infer).toHaveBeenCalledTimes(2); // review(1) + review(2)
    expect(runtimeGraph.nodes).toHaveLength(1);
  });
});
