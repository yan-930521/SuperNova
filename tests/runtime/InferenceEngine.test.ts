import { InferenceEngine } from '../../src/runtime/ModelRegistry';
import { IAgentState } from '../../interfaces/agent/IAgentState';
import { z } from 'zod';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

describe('InferenceEngine', () => {
  let mockModel: any;
  let engine: InferenceEngine;
  let initialState: IAgentState;

  beforeEach(() => {
    mockModel = {
      withStructuredOutput: jest.fn().mockReturnThis(),
      invoke: jest.fn()
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
    };
  });

  it('should update state.messages with HumanMessage and AIMessage on success', async () => {
    const schema = z.object({ answer: z.string() });
    mockModel.invoke.mockResolvedValue({ answer: "Hello" });

    const prompt = "Say hello";
    const result = await engine.infer(prompt, initialState, schema);

    expect(result).toEqual({ answer: "Hello" });
    expect(initialState.messages).toHaveLength(2);
    expect(initialState.messages[0]).toBeInstanceOf(HumanMessage);
    expect(initialState.messages[0].content).toBe(prompt);
    expect(initialState.messages[1]).toBeInstanceOf(AIMessage);
    expect(initialState.messages[1].content).toContain("Hello");
  });

  it('should update state.errors on failure', async () => {
    const schema = z.object({ answer: z.string() });
    mockModel.invoke.mockRejectedValue(new Error("LLM Error"));

    const prompt = "Say hello";
    await expect(engine.infer(prompt, initialState, schema)).rejects.toThrow("LLM Error");

    expect(initialState.errors).toHaveLength(1);
    expect(initialState.errors[0]).toContain("LLM Error");
    expect(initialState.messages).toHaveLength(1);
    expect(initialState.messages[0].content).toBe(prompt);
  });
});
