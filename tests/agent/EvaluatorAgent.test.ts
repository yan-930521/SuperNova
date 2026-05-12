import { EvaluatorAgent } from '../../src/agent/EvaluatorAgent';
import { IModelRegistry, IInferenceEngine, ModelPreset } from '../../interfaces/runtime/IModelRegistry';
import { ThoughtEvalResponseSchema, PlanReviewSchema } from '../../src/schemas/agent/AgentOutputSchemas';

describe('EvaluatorAgent', () => {
  let agent: EvaluatorAgent;
  let mockRegistry: jest.Mocked<IModelRegistry>;
  let mockInference: jest.Mocked<IInferenceEngine>;

  beforeEach(() => {
    mockInference = {
      infer: jest.fn()
    } as any;

    mockRegistry = {
      getModel: jest.fn().mockReturnValue(mockInference),
      registerModel: jest.fn()
    } as any;

    agent = new EvaluatorAgent(mockRegistry);
  });

  test('should initialize with correct model preset', () => {
    expect(mockRegistry.getModel).toHaveBeenCalledWith(ModelPreset.EVAL);
  });

  test('should evaluate a batch of thoughts using real inference logic', async () => {
    // 設置模擬配置
    await agent.initFromJSON({
      id: 'eval-01',
      role: 'Evaluator',
      prompts: {
        thought_eval: 'Evaluate these: {items}'
      }
    });

    const targets = [{ id: 't1', content: 'thought 1' }, { id: 't2', content: 'thought 2' }];
    const criteria = {
      type: 'thought',
      goal: 'Test Goal',
      messages: []
    };

    // 模擬模型回傳數組 (ThoughtEvalResponseSchema)
    const simulatedResponse = [
      { targetId: 't1', score: 8, rationale: 'Good' },
      { targetId: 't2', score: 4, rationale: 'Bad' }
    ];
    mockInference.infer.mockResolvedValue(simulatedResponse);

    const results = await agent.evaluateBatch(targets, criteria);

    expect(results).toHaveLength(2);
    expect(results[0].targetId).toBe('t1');
    expect(results[0].score).toBe(8);
    expect(results[0].evaluatorId).toBe('eval-01');
    
    // 驗證 infer 調用參數
    expect(mockInference.infer).toHaveBeenCalledWith(
      'Evaluate these: {items}',
      expect.anything(),
      ThoughtEvalResponseSchema,
      expect.objectContaining({
        variables: expect.objectContaining({ items: targets, goal: 'Test Goal' })
      })
    );
  });

  test('should review a plan and map single result to evaluation record', async () => {
    await agent.initFromJSON({
      id: 'eval-01',
      prompts: {
        plan_review: 'Review plan for: {goal}'
      }
    });

    const criteria = {
      type: 'plan',
      goal: 'Build a house'
    };

    // 模擬模型回傳單個物件 (PlanReviewSchema)
    const simulatedResponse = { score: 9, rationale: 'Excellent plan' };
    mockInference.infer.mockResolvedValue(simulatedResponse);

    const results = await agent.evaluateBatch([], criteria);

    expect(results).toHaveLength(1);
    expect(results[0].targetId).toBe('current_plan');
    expect(results[0].score).toBe(9);
    expect(results[0].rationale).toBe('Excellent plan');
  });

  test('should handle executeIntent for evaluate type', async () => {
    const evaluateSpy = jest.spyOn(agent, 'evaluateBatch').mockResolvedValue([]);
    
    const intent = {
      type: 'evaluate',
      targets: [],
      criteria: { type: 'thought' }
    };

    await agent.executeIntent(intent);
    expect(evaluateSpy).toHaveBeenCalledWith([], intent.criteria);
  });
});
