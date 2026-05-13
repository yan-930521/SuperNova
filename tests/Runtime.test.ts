import { GlobalRuntime } from '../src/runtime/GlobalRuntime';
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
    let mockSessionManager: any;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
      mockSessionManager = {
        createFromJSON: jest.fn(),
        restoreFromSnapshot: jest.fn(),
        getActiveSessions: jest.fn().mockReturnValue({})
      };
      mockEventBus = { publish: jest.fn(), subscribe: jest.fn() } as any;
      runtime = new GlobalRuntime(mockSessionManager as ISessionManager, mockEventBus);
      runtime.config = {
        runtime: { tick_rate_ms: 100, max_active_sessions: 10 }
      } as any;
    });

    test('should trigger session ticks on interval', async () => {
      const mockSession: Partial<ISession> = { tick: jest.fn().mockResolvedValue(undefined) };
      mockSessionManager.getActiveSessions.mockReturnValue({ 's1': mockSession });

      await runtime.start();
      
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSession.tick).toHaveBeenCalled();
      await runtime.stop();
    });

    test('should stop when stop is called', async () => {
      const mockSession: Partial<ISession> = { tick: jest.fn().mockResolvedValue(undefined) };
      mockSessionManager.getActiveSessions.mockReturnValue({ 's1': mockSession });

      await runtime.start();
      await runtime.stop();
      
      jest.advanceTimersByTime(200);
      await Promise.resolve();

      expect(mockSession.tick).not.toHaveBeenCalled();
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
      const mockChain = { invoke: mockInvoke };
      const mockTemplate = { pipe: jest.fn().mockReturnValue(mockChain) };

      jest.spyOn(ChatPromptTemplate, 'fromMessages').mockReturnValue(mockTemplate as any);

      mockModel = { 
        withStructuredOutput: jest.fn().mockReturnValue({})
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

    it('should update state.messages on success', async () => {
      const schema = z.object({ answer: z.string() });
      const prompt = "Say hello";
      const result = await engine.infer(prompt, initialState, schema);

      expect(result).toEqual({ answer: "Hello" });
      expect(initialState.messages).toHaveLength(2);
      expect(initialState.messages[0].content).toBe(prompt);
      expect(initialState.messages[1].content).toContain("Hello");
    });

    it('should update state.errors on failure', async () => {
      const schema = z.object({ answer: z.string() });
      mockInvoke.mockRejectedValue(new Error("LLM Error"));

      await expect(engine.infer("Say hello", initialState, schema)).rejects.toThrow("LLM Error");
      expect(initialState.errors).toHaveLength(1);
      expect(initialState.errors[0]).toContain("LLM Error");
    });
  });
});
