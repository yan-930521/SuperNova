import { ITaskPlanEngine, ITaskGraph, ITaskNode } from '../../interfaces/agent/ITaskPlanEngine';
import { IAgentState, AgentStateAnnotation } from '../../interfaces/agent/IAgentState';
import { IInferenceEngine, ModelPreset, IModelRegistry } from '../../interfaces/runtime/IModelRegistry';
import { MilestonePlanSchema, TaskExpandResponseSchema, PlanReviewSchema, ContextProjectionSchema } from '../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../utils/PromptLoader';
import { v4 as uuidv4 } from 'uuid';
import { StateGraph, END, START } from '@langchain/langgraph';

/**
 * TaskPlanEngine 實作類
 * 內部封裝了 LangGraph 流程，負責里程碑規劃與任務展開。
 */
export class TaskPlanEngine implements ITaskPlanEngine {
  private graph: any;
  private smartInference: IInferenceEngine;
  private evalInference: IInferenceEngine;

  constructor(private modelRegistry: IModelRegistry) {
    this.smartInference = this.modelRegistry.getModel(ModelPreset.SMART);
    this.evalInference = this.modelRegistry.getModel(ModelPreset.EVAL);
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const workflow = new StateGraph(AgentStateAnnotation)
      .addNode("plan_milestones", (state: typeof AgentStateAnnotation.State) => this.planMilestones(state))
      .addNode("review", (state: typeof AgentStateAnnotation.State) => this.reviewAndProject(state))
      .addNode("expand", (state: typeof AgentStateAnnotation.State) => this.expandMilestone(state));

    workflow.addEdge(START, "plan_milestones");
    workflow.addEdge("plan_milestones", "review");

    workflow.addConditionalEdges(
      "review",
      (state: typeof AgentStateAnnotation.State) => {
        // 如果評分通過，進入展開階段；否則重規
        const lastEval = state.lastEvaluations[state.lastEvaluations.length - 1];
        return (lastEval && lastEval.score >= 7) ? "expand" : "plan_milestones";
      },
      {
        expand: "expand",
        plan_milestones: "plan_milestones"
      }
    );

    workflow.addEdge("expand", END);

    return workflow.compile();
  }

  async run(state: IAgentState): Promise<IAgentState> {
    return await this.graph.invoke(state);
  }

  /**
   * [Node] 里程碑規劃
   */
  async planMilestones(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const prompt = PromptLoader.load('prompts/planning/milestone_plan.md', 'Plan milestones for goal: {goal}');
    const result = await this.smartInference.infer(prompt, state as any, MilestonePlanSchema);

    return {
      planning: {
        ...state.planning,
        milestones: result.milestones
      }
    };
  }

  /**
   * [Node] 審查規劃與預測未來上下文
   */
  async reviewAndProject(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    // 1. 執行架構審查
    const reviewPrompt = PromptLoader.load('prompts/planning/plan_review.md', 'Review these milestones: {items}');
    const review = await this.evalInference.infer(reviewPrompt, state as any, PlanReviewSchema, {
      variables: { items: state.planning.milestones }
    });

    // 2. 執行環境投影
    const projectionPrompt = PromptLoader.load('prompts/common/context_projection.md', 'Project context for: {task_graph}');
    const projection = await this.smartInference.infer(projectionPrompt, state as any, ContextProjectionSchema, {
      variables: { 
        current_context: "Initial state",
        task_graph: state.planning.milestones
      }
    });

    return {
      planning: {
        ...state.planning,
        projectedContext: projection
      },
      lastEvaluations: [{ targetId: 'current_milestones', score: review.score, rationale: review.rationale }]
    };
  }

  /**
   * [Node] 任務展開 (DAG)
   */
  async expandMilestone(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const milestone = state.planning.milestones[state.planning.currentMilestoneIdx];
    if (!milestone) return {};

    const prompt = PromptLoader.load('prompts/planning/task_expand.md', 'Expand milestone: {milestone}');
    const result = await this.smartInference.infer(prompt, state as any, TaskExpandResponseSchema, {
      variables: {
        milestone: milestone,
        projected_context: state.planning.projectedContext
      }
    });

    // 為模型回傳的任務生成 UUID (如果模型沒產出的話)
    const nodes: ITaskNode[] = result.nodes.map(n => ({
      ...n,
      id: n.id || uuidv4(),
      status: 'pending' as const
    }));

    const taskGraph: ITaskGraph = {
      nodes,
      milestones: state.planning.milestones,
      currentMilestoneIndex: state.planning.currentMilestoneIdx
    };

    return {
      planning: { ...state.planning, taskGraph }
    };
  }

  async replan(failedNodeId: string): Promise<ITaskGraph> {
    // 基礎實現：紀錄失敗並重新啟動規劃流程
    console.log(`[TaskPlanEngine] Replanning due to failure at node: ${failedNodeId}`);
    
    // 這裡我們模擬一個簡單的重規行為：直接回傳目前的圖，但在實際應用中，
    // 可能需要更新 state 並重新 run graph。
    return { 
      nodes: [], 
      milestones: [], 
      currentMilestoneIndex: 0 
    };
  }
}
