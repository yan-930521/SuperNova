import { z } from 'zod';
import { BaseAgent } from '../src/agent/BaseAgent';
import { WorkerAgent } from '../src/agent/WorkerAgent';
import { EvaluatorAgent } from '../src/agent/EvaluatorAgent';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import { IModelRegistry, IInferenceEngine, ModelPreset } from '../interfaces/runtime/IModelRegistry';
import { ThoughtEvalResponseSchema } from '../src/schemas/agent/AgentOutputSchemas';
import type { IMutationRequest } from '../interfaces/models/IMutationRequest';

// Mock LangChain's createReactAgent
jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: jest.fn().mockReturnValue({ invoke: jest.fn() })
}));

import { createReactAgent } from '@langchain/langgraph/prebuilt';

describe('Agent Theme Tests', () => {

  describe('BaseAgent', () => {
    let agent: BaseAgent;

    beforeEach(() => {
      agent = new BaseAgent();
    });

    test('should initialize correctly from JSON', async () => {
      const config = {
        id: 'agent-001',
        role: 'worker',
        identity: '',
        capabilities: [],
        customSetting: 'enabled',
        nest: { key: 'value' }
      };

      await agent.initFromJSON(config);

      expect(agent.id).toBe('agent-001');
      expect(agent.role).toBe('worker');
      expect(agent.toJSON()).toEqual(config);
    });

    test('should preserve complex state during re-initialization', async () => {
      const config = {
        id: 'agent-001',
        role: 'worker',
        prompts: { identity: 'I am a tester' },
        capabilities: ['test'],
        state: {
          memory: ['item1', 'item2'],
          metadata: { lastActive: 123456 }
        }
      };

      await agent.initFromJSON(config);
      const json = agent.toJSON();
      
      const newAgent = new BaseAgent();
      await newAgent.initFromJSON(json);
      
      expect(newAgent.toJSON()).toEqual(json);
      expect(newAgent.id).toBe('agent-001');
      expect(newAgent.identity).toBe('I am a tester');
    });

    test('should handle missing id and role in config', async () => {
      await agent.initFromJSON({});
      expect(agent.id).toBe('');
      expect(agent.role).toBe('');
    });

    test('should report not ready initially', () => {
      expect(agent.isReady()).toBe(false);
    });

    test('should log when receiving a task', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      await agent.initFromJSON({ id: 'test-agent' });
      
      const task = { type: 'test-task', data: 123 };
      await agent.receiveTask(task);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[BaseAgent test-agent] Receiving task:')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(task))
      );
      
      logSpy.mockRestore();
    });

    test('should log when proposing a mutation', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      await agent.initFromJSON({ id: 'test-agent' });

      const mutation: IMutationRequest = {
        requester_id: 'test-agent',
        target_hook: 'onMessage',
        mutation_type: 'UPDATE',
        proposed_change: { newRule: true },
        priority: 10,
        version_ref: 'v1'
      };

      await agent.proposeMutation(mutation);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[BaseAgent test-agent] Proposing mutation to onMessage')
      );

      logSpy.mockRestore();
    });

    describe('Component Management', () => {
      test('should add and retrieve a component', () => {
        const mockComponent = {
          name: 'test-component',
          attach: jest.fn().mockResolvedValue(undefined)
        };

        agent.addComponent(mockComponent as any);
        const retrieved = agent.getComponent('test-component');

        expect(retrieved).toBe(mockComponent);
      });

      test('should throw error when retrieving non-existent component', () => {
        expect(() => agent.getComponent('missing')).toThrow('Component missing not found on Agent');
      });
    });
  });

  describe('WorkerAgent', () => {
    let toolRegistry: ToolRegistry;
    let workerAgent: WorkerAgent;
    let mockModelRegistry: any;

    beforeEach(() => {
      toolRegistry = new ToolRegistry();
      mockModelRegistry = {
        getRawModel: jest.fn().mockReturnValue({}),
        getModel: jest.fn().mockReturnValue({
          withSystemPrompt: jest.fn().mockReturnThis()
        })
      };
      workerAgent = new WorkerAgent(toolRegistry, mockModelRegistry);
      (createReactAgent as jest.Mock).mockClear();
    });

    it('should initialize correctly from JSON', async () => {
      const config = {
        id: 'worker-1',
        role: 'test-worker',
        prompts: {
          identity: 'I am a test worker'
        },
        capabilities: ['test-cap']
      };

      await workerAgent.initFromJSON(config);

      expect(workerAgent.id).toBe('worker-1');
      expect(workerAgent.role).toBe('test-worker');
      expect(workerAgent.identity).toBe('I am a test worker');
      expect(workerAgent.capabilities).toContain('test-cap');
      expect(workerAgent.isReady()).toBe(true);
    });

    describe('Immutability & ReAct Engine', () => {
      it('should only call createReactAgent once during initial initFromJSON', async () => {
        const config = {
          id: 'worker-1',
          role: 'test-role',
          prompts: { identity: 'initial identity' }
        };

        await workerAgent.initFromJSON(config);
        expect(createReactAgent).toHaveBeenCalledTimes(1);

        // Second call with same identity
        await workerAgent.initFromJSON(config);
        expect(createReactAgent).toHaveBeenCalledTimes(1); // Still 1
      });

      it('should ignore identity changes after initialization and not rebuild engine', async () => {
        const config1 = {
          id: 'worker-1',
          role: 'test-role',
          prompts: { identity: 'initial identity' }
        };

        const config2 = {
          id: 'worker-1',
          role: 'test-role',
          prompts: { identity: 'new identity' }
        };

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        await workerAgent.initFromJSON(config1);
        expect(createReactAgent).toHaveBeenCalledTimes(1);
        expect(workerAgent.identity).toBe('initial identity');

        await workerAgent.initFromJSON(config2);
        expect(createReactAgent).toHaveBeenCalledTimes(1); // Still 1, no rebuild
        expect(workerAgent.identity).toBe('initial identity'); // Still initial
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Attempted to change identity after initialization'));

        warnSpy.mockRestore();
      });
    });

    it('should execute task by running the corresponding tool', async () => {
      const mockTool = {
        name: 'test-tool',
        description: 'test-desc',
        safety_tier: 'TIER_1' as const,
        schema: z.any(),
        validateInput: jest.fn().mockResolvedValue(true),
        run: jest.fn().mockResolvedValue('tool-result'),
        required_capabilities: []
      };

      toolRegistry.register(mockTool);

      const taskNode = {
        id: 'task-1',
        type: 'test-tool',
        goal: 'test-goal',
        metadata: { data: 'test-input' }
      };

      const result = await workerAgent.processTask(taskNode as any);

      expect(result).toBe('tool-result');
      expect(mockTool.run).toHaveBeenCalledWith(
        'test-input',
        expect.objectContaining({
          agentId: workerAgent.id
        })
      );
    });

    it('should throw error if tool is not found', async () => {
      const taskNode = {
        id: 'task-fail',
        type: 'non-existent-tool',
        goal: 'fail'
      };

      await expect(workerAgent.processTask(taskNode as any)).rejects.toThrow('找不到保底工具: non-existent-tool');
    });
  });

  describe('EvaluatorAgent', () => {
    let agent: EvaluatorAgent;
    let mockRegistry: jest.Mocked<IModelRegistry>;
    let mockInference: jest.Mocked<IInferenceEngine>;

    beforeEach(() => {
      mockInference = {
        infer: jest.fn(),
        withSystemPrompt: jest.fn().mockReturnThis()
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

    test('should report ready after initialization', async () => {
      expect(agent.isReady()).toBe(false);
      await agent.initFromJSON({ id: 'eval-1' });
      expect(agent.isReady()).toBe(true);
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
        expect.objectContaining({ goal: 'Test Goal' }),
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

    test('should handle processTask for evaluate type', async () => {
      const evaluateSpy = jest.spyOn(agent, 'evaluateBatch').mockResolvedValue([]);
      
      const taskNode = {
        id: 'eval-task',
        type: 'evaluate_thought',
        data: {
          targets: [],
          criteria: { goal: 'test' }
        }
      };

      await agent.processTask(taskNode);
      expect(evaluateSpy).toHaveBeenCalled();
    });
  });
});
