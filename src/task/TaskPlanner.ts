import { v4 as uuidv4 } from 'uuid';

import { END, START, StateGraph } from '@langchain/langgraph';

import { recorder } from '../infra/LogManager';
import { InferenceEngine, ModelRegistry } from '../infra/ModelRegistry';
import { ModelPreset } from '../infra/types/agent';
import { TaskDTO, TaskGraphData } from '../infra/types/task';
import { AgentState, AgentStateAnnotation } from '../models/AgentState';
import { TaskGraph } from '../models/TaskGraph';
import { GlobalRuntime } from '../runtime/GlobalRuntime';
import {
    ContextProjectionSchema, MilestonePlanSchema, PlanReviewSchema, TaskExpandResponseSchema
} from '../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../utils/PromptLoader';

/**
 * TaskPlanner
 * 負責將目標 (Goal) 透過 LangGraph 工作流拆解為具備依賴關係的任務圖 (TaskGraph)。
 */
export class TaskPlanner {
  private graph: any;
  private milestoneEngine: InferenceEngine;
  private reviewEngine: InferenceEngine;
  private projectionEngine: InferenceEngine;
  private expansionEngine: InferenceEngine;
  private replanEngine: InferenceEngine;

  constructor() {
    const smart = GlobalRuntime.getInstance().modelRegistry.getModel(ModelPreset.SMART);
    const evalModel = GlobalRuntime.getInstance().modelRegistry.getModel(ModelPreset.EVAL);

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
        const lastEval = state.lastEvaluations[state.lastEvaluations.length - 1];
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

  /**
   * 執行完整的規劃工作流 (LangGraph)
   */
  async run(state: AgentState): Promise<AgentState> {
    // 增加遞迴限制至 50
    return await this.graph.invoke(state, { recursionLimit: 50 });
  }

  async planMilestones(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    recorder.info(`[TaskPlanner] Planning milestones for goal: ${state.goal}`, { type: 'PLAN' });
    const result = await this.milestoneEngine.infer(state as any, MilestonePlanSchema);
    
    return {
      planning: {
        ...state.planning,
        milestones: result.milestones
      }
    };
  }

  async reviewAndProject(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    recorder.info(`[TaskPlanner] Reviewing milestones and projecting context...`, { type: 'PLAN' });
    
    const review = await this.reviewEngine.infer(state as any, PlanReviewSchema, {
      variables: { items: state.planning.milestones }
    });

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

  async expandMilestone(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const finalGraphData = state.planning.taskGraph || { nodes: [], milestones: state.planning.milestones, currentMilestoneIndex: -1 };
    const finalGraph = new TaskGraph();
    finalGraph.loadFromJSON(finalGraphData);

    const currentIdx = state.planning.currentMilestoneIdx;
    if (currentIdx < 0 || currentIdx >= state.planning.milestones.length) {
      recorder.warn(`[TaskPlanner] Invalid milestone index: ${currentIdx}`, { type: 'PLAN' });
      return { planning: state.planning };
    }

    const milestone = state.planning.milestones[currentIdx];
    const milestonePrefix = `m${currentIdx + 1}_`;

    recorder.info(`[TaskPlanner] Expanding milestone [${currentIdx + 1}/${state.planning.milestones.length}]: ${milestone}`, { 
      type: 'PLAN',
      session_id: state.metadata?.sessionId,
      trace_id: state.metadata?.traceId
    });

    // Determine previous milestone task IDs for cross-milestone dependencies
    const prevTasks = finalGraph.getAllTasks().filter(t => t.id.startsWith(`m${currentIdx}_`));
    const prevTaskIds = prevTasks.map(t => t.id);

    const result = await this.expansionEngine.infer(state as any, TaskExpandResponseSchema, {
      variables: {
        milestone: milestone,
        projected_context: JSON.stringify(state.planning.projectedContext),
        available_agents: JSON.stringify(state.metadata?.available_agents || []),
        // Add results of previous tasks to context if available
        execution_history: JSON.stringify(finalGraph.getAllTasks().filter(t => t.status === 'completed').map(t => ({ id: t.id, goal: t.goal, result: t.result })))
      }
    });

    const currentMilestoneNodes: TaskDTO[] = result.nodes.map((n: any) => {
      const originalId = n.id || uuidv4();
      const globalId = `${milestonePrefix}${originalId}`;
      const internalDeps = (n.dependencies || []).map((d: any) => `${milestonePrefix}${d}`);
      
      // If no internal dependencies, depend on all tasks from the previous milestone
      const globalDeps = (internalDeps.length > 0) ? internalDeps : [...prevTaskIds];
        
      return {
        ...n,
        id: globalId,
        dependencies: globalDeps,
        status: 'pending' as const
      };
    });

    currentMilestoneNodes.forEach(node => finalGraph.addTask(node.id, node as any));
    currentMilestoneNodes.forEach(node => {
      node.dependencies.forEach(depId => {
        try { finalGraph.addDependency(depId, node.id); } catch (e) {}
      });
    });

    const updatedGraphData = finalGraph.toJSON() as unknown as TaskGraphData;
    updatedGraphData.milestones = state.planning.milestones;
    updatedGraphData.currentMilestoneIndex = currentIdx;

    return {
      planning: { ...state.planning, taskGraph: updatedGraphData }
    };
  }

  async replan(state: AgentState, failedNodeId: string, error: string): Promise<Partial<AgentState>> {
    const failedNode = state.planning.taskGraph?.nodes.find((n: any) => n.id === failedNodeId);
    
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

    const nodes: TaskDTO[] = result.nodes.map((n: any) => ({
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
