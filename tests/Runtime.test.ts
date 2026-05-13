import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
import { SessionManager } from '../src/infra/SessionManager';
import { EventBus } from '../src/infra/EventBus';
import { Guardian, TimeoutError } from '../src/runtime/Guardian';
import { InferenceEngine } from '../src/runtime/ModelRegistry';
import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { IEventBus } from '../interfaces/infra/IEventBus';
import type { ISessionManager } from '../interfaces/infra/ISessionManager';
import type { ISession } from '../interfaces/session/ISession';
import type { IAgentState } from '../interfaces/agent/IAgentState';

describe('Runtime Theme Tests', () => {
  
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('GlobalRuntime', () => {
    let runtime: GlobalRuntime;
    let sessionManager: SessionManager;
    let eventBus: EventBus;

    beforeEach(() => {
      sessionManager = new SessionManager();
      eventBus = new EventBus();
      runtime = new GlobalRuntime(sessionManager, eventBus);
      runtime.config = {
        runtime: { tick_rate_ms: 100, max_active_sessions: 10 }
      } as any;
    });

    test('should trigger session ticks on interval', async () => {
      const session = await sessionManager.createFromJSON({ id: 's1', goal: 'test' });
      const tickSpy = jest.spyOn(session, 'tick').mockResolvedValue(undefined);

      await runtime.start();
      
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(tickSpy).toHaveBeenCalled();
      await runtime.stop();
    });

    test('should stop when stop is called', async () => {
      const session = await sessionManager.createFromJSON({ id: 's1', goal: 'test' });
      const tickSpy = jest.spyOn(session, 'tick').mockResolvedValue(undefined);

      await runtime.start();
      await runtime.stop();
      
      jest.advanceTimersByTime(200);
      await Promise.resolve();

      expect(tickSpy).not.toHaveBeenCalled();
    });
  });

  describe('Guardian', () => {
    let guardian: Guardian;
    beforeEach(() => {
      guardian = new Guardian();
    });

    test('should complete a successful task within timeout', async () => {
      const task = async () => 'success';
      const result = await guardian.protect(task, 1000);
      expect(result).toBe('success');
    });

    test('should throw TimeoutError if task exceeds timeout', async () => {
      const task = () => new Promise((resolve) => {
        setTimeout(() => resolve('slow'), 500);
      });
      
      const promise = guardian.protect(task, 100);
      jest.advanceTimersByTime(101);
      await expect(promise).rejects.toThrow(TimeoutError);
    });

    test('should resolve correct strategies', () => {
      expect(guardian.resolveStrategy(new TimeoutError())).toBe('RETRY');
      expect(guardian.resolveStrategy(new SyntaxError())).toBe('ABORT');
      expect(guardian.resolveStrategy(new Error('Normal Error'))).toBe('IGNORE');
    });
  });

  describe('InferenceEngine', () => {
    let mockModel: any;
    let engine: InferenceEngine;
    let initialState: IAgentState;
    let mockInvoke: jest.Mock;

    beforeEach(() => {
      mockInvoke = jest.fn();
      mockModel = { 
        withStructuredOutput: jest.fn().mockReturnValue({
          invoke: mockInvoke
        })
      };

      engine = new InferenceEngine(mockModel as any);
      initialState = {
        goal: "Test goal",
        messages: [],
        currentTask: "",
        thoughtTree: { nodes: [], rootId: null, activeNodeId: null, iterationCount: 0 },
        planning: { milestones: [], currentMilestoneIdx: 0, taskGraph: null, projectedContext: {} },
        lastEvaluations: [],
        errors: [],
        metadata: {}
      } as any;

      mockInvoke.mockResolvedValue({ answer: "Hello" });
    });

    it('should NOT update state.messages (stateless)', async () => {
      const schema = z.object({ answer: z.string() });
      const boundEngine = engine.withSystemPrompt("You are {role}");
      const result = await boundEngine.infer(initialState, schema, { variables: { role: "assistant" } });

      expect(result).toEqual({ answer: "Hello" });
      expect(initialState.messages).toHaveLength(0); // Should remain 0
      
      // Check if invoke was called with SystemMessage and role rendered
      const calledMessages = mockInvoke.mock.calls[0][0];
      expect(calledMessages[0].constructor.name).toBe('SystemMessage');
      expect(calledMessages[0].content).toBe('You are assistant');
    });

    it('should throw error on failure but NOT update state.errors', async () => {
      const schema = z.object({ answer: z.string() });
      mockInvoke.mockRejectedValue(new Error("LLM Error"));

      await expect(engine.infer(initialState, schema)).rejects.toThrow("LLM Error");
      expect(initialState.errors).toHaveLength(0); // Should remain 0
    });
  });
});
