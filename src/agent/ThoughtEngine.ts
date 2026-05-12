import { IThoughtEngine, IThoughtNode } from '../../interfaces/agent/IThoughtEngine';
import { IAgentState, AgentStateAnnotation, IEvaluationRecord } from '../../interfaces/agent/IAgentState';
import { IInferenceEngine, ModelPreset, IModelRegistry } from '../../interfaces/runtime/IModelRegistry';
import { ThoughtGenResponseSchema, ThoughtEvalResponseSchema } from '../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../utils/PromptLoader';
import { v4 as uuidv4 } from 'uuid';
import { StateGraph, END, START } from '@langchain/langgraph';

/**
 * ThoughtEngine 實作類
 */
export class ThoughtEngine implements IThoughtEngine {
  private graph: any;
  private fastInference: IInferenceEngine;
  private evalInference: IInferenceEngine;

  constructor(private modelRegistry: IModelRegistry) {
    this.fastInference = this.modelRegistry.getModel(ModelPreset.FAST);
    this.evalInference = this.modelRegistry.getModel(ModelPreset.EVAL);
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const workflow = new StateGraph(AgentStateAnnotation)
      .addNode("generate", (state: typeof AgentStateAnnotation.State) => this.generateCandidates(state))
      .addNode("evaluate", (state: typeof AgentStateAnnotation.State) => this.evaluateCandidates(state))
      .addNode("decide", (state: typeof AgentStateAnnotation.State) => this.decideNextThought(state));

    workflow.addEdge(START, "generate");
    workflow.addEdge("generate", "evaluate");
    workflow.addEdge("evaluate", "decide");

    workflow.addConditionalEdges(
      "decide",
      (state: typeof AgentStateAnnotation.State) => {
        if (state.thoughtTree.activeNodeId) return "end";
        if (state.thoughtTree.iterationCount < 3) return "generate";
        return "end";
      },
      {
        generate: "generate",
        end: END
      }
    );

    return workflow.compile();
  }

  async run(state: IAgentState): Promise<IAgentState> {
    return await this.graph.invoke(state);
  }

  /**
   * [Node] 生成候選思維分支
   */
  async generateCandidates(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const parentId = state.thoughtTree.activeNodeId;
    const depth = parentId ? (state.thoughtTree.nodes.find(n => n.id === parentId)?.depth || 0) + 1 : 0;
    
    // 安全加載原始 Template (不手動渲染)
    const prompt = PromptLoader.load(
      'prompts/reasoning/thought_gen.md',
      'Generate {count} next steps for goal: {goal}'
    );

    const rawBranches = await this.fastInference.infer(prompt, state as any, ThoughtGenResponseSchema, {
      variables: {
        task: state.currentTask || 'N/A',
        count: '3'
      }
    });

    const newNodes: IThoughtNode[] = (rawBranches || []).map((branch: any) => ({
      id: uuidv4(),
      content: branch.content || 'Untitled thought',
      parentId: parentId,
      score: 0,
      depth: depth,
      status: 'pending',
      metadata: { type: branch.type }
    }));

    return {
      thoughtTree: {
        ...state.thoughtTree,
        nodes: [...state.thoughtTree.nodes, ...newNodes],
      }
    };
  }

  /**
   * [Node] 評價候選思路
   */
  async evaluateCandidates(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const pendingNodes = state.thoughtTree.nodes.filter(n => n.status === 'pending' && n.score === 0);
    if (pendingNodes.length === 0) return {};

    const prompt = PromptLoader.load(
      'prompts/reasoning/thought_eval.md',
      'Evaluate these thoughts: {items}'
    );

    const evaluations = await this.evalInference.infer(prompt, state as any, ThoughtEvalResponseSchema, {
      variables: {
        items: pendingNodes
      }
    });

    const updatedNodes = state.thoughtTree.nodes.map(node => {
      const result = evaluations?.find((e: any) => e.targetId === node.id);
      return result ? { ...node, score: result.score, rationale: result.rationale } : node;
    });

    return {
      thoughtTree: { ...state.thoughtTree, nodes: updatedNodes },
      lastEvaluations: evaluations as IEvaluationRecord[]
    };
  }

  async decideNextThought(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const scoredNodes = state.thoughtTree.nodes.filter(n => n.status === 'pending' && n.score > 0);
    if (scoredNodes.length === 0) return { thoughtTree: { ...state.thoughtTree, iterationCount: state.thoughtTree.iterationCount + 1 } };

    const best = scoredNodes.reduce((prev, current) => (prev.score > current.score) ? prev : current);

    if (best.score >= 7) {
      return {
        thoughtTree: {
          ...state.thoughtTree,
          nodes: state.thoughtTree.nodes.map(n => n.id === best.id ? { ...n, status: 'active' as const } : n),
          activeNodeId: best.id,
          iterationCount: state.thoughtTree.iterationCount + 1
        }
      };
    }

    return {
      thoughtTree: { ...state.thoughtTree, iterationCount: state.thoughtTree.iterationCount + 1 }
    };
  }

  toJSON(): Record<string, any> { return {}; }
}
