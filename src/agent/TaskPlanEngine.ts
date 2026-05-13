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
  private milestoneEngine: IInferenceEngine;
  private reviewEngine: IInferenceEngine;
  private projectionEngine: IInferenceEngine;
  private expansionEngine: IInferenceEngine;
  private replanEngine: IInferenceEngine;

  constructor(private modelRegistry: IModelRegistry) {
    const smart = this.modelRegistry.getModel(ModelPreset.SMART);
    const evalModel = this.modelRegistry.getModel(ModelPreset.EVAL);

    // 1. 預先載入並綁定提示詞，達成「維持特定 prompt」
    this.milestoneEngine = smart.withSystemPrompt(
      PromptLoader.load('prompts/planning/milestone_plan.md', 'Plan milestones for goal: {goal}')
    );
    this.reviewEngine = evalModel.withSystemPrompt(
      PromptLoader.load('prompts/planning/plan_review.md', 'Review these milestones: {items}')
    );
    this.projectionEngine = smart.withSystemPrompt(
      PromptLoader.load('prompts/common/context_projection.md', 'Project context for: {task_graph}')
    );
    this.expansionEngine = smart.withSystemPrompt(
      PromptLoader.load('prompts/planning/task_expand.md', 'Expand milestone: {milestone}')
    );
    this.replanEngine = smart.withSystemPrompt(
      PromptLoader.load('prompts/planning/replan.md', 'Replan for failed task: {failed_task_id}')
    );

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
        // 降低過審門檻至 6 分，減少無效循環
        return (lastEval && lastEval.score >= 6) ? "expand" : "plan_milestones";
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
    // 增加遞迴限制至 50
    return await this.graph.invoke(state, { recursionLimit: 50 });
  }

  /**
   * [Node] 里程碑規劃
   */
  async planMilestones(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const result = await this.milestoneEngine.infer(state as any, MilestonePlanSchema);

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
    const review = await this.reviewEngine.infer(state as any, PlanReviewSchema, {
      variables: { items: state.planning.milestones }
    });

    // 2. 執行環境投影
    const projection = await this.projectionEngine.infer(state as any, ContextProjectionSchema, {
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

    const result = await this.expansionEngine.infer(state as any, TaskExpandResponseSchema, {
      variables: {
        milestone: milestone,
        projected_context: state.planning.projectedContext,
        available_agents: JSON.stringify(state.metadata?.available_agents || [])
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

  async replan(state: IAgentState, failedNodeId: string, error: string): Promise<Partial<IAgentState>> {
    const failedNode = state.planning.taskGraph?.nodes.find(n => n.id === failedNodeId);
    
    const result = await this.replanEngine.infer(state as any, TaskExpandResponseSchema, {
      variables: {
        goal: state.goal,
        failed_task_id: failedNodeId,
        failed_task_goal: failedNode?.goal || 'Unknown',
        error: error,
        history: JSON.stringify(state.messages),
        current_graph: JSON.stringify(state.planning.taskGraph),
        available_agents: JSON.stringify(state.metadata?.available_agents || [])
      }
    });

    // 為模型回傳的任務生成 UUID (如果模型沒產出的話) 並初始化狀態
    const nodes: ITaskNode[] = result.nodes.map(n => ({
      ...n,
      id: n.id || uuidv4(),
      status: 'pending' as const
    }));

    return {
      planning: {
        ...state.planning,
        taskGraph: {
          ...state.planning.taskGraph!,
          nodes
        }
      }
    };
  }
}
