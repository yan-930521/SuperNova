import { v4 as uuidv4 } from 'uuid';

import { END, START, StateGraph } from '@langchain/langgraph';

import { AgentStateAnnotation, IAgentState } from '../../interfaces/agent/IAgentState';
import { ITaskGraph, ITaskNode, ITaskPlanEngine } from '../../interfaces/agent/ITaskPlanEngine';
import {
    IInferenceEngine, IModelRegistry, ModelPreset
} from '../../interfaces/runtime/IModelRegistry';
import { logger } from '../infra/LogManager';
import {
    ContextProjectionSchema, MilestonePlanSchema, PlanReviewSchema, TaskExpandResponseSchema
} from '../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../utils/PromptLoader';
import { TaskGraph } from '../session/TaskGraph';

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
    logger.info(`[TaskPlanEngine] Planning milestones for goal: ${state.goal}`, { type: 'PLAN' });
    const result = await this.milestoneEngine.infer(state as any, MilestonePlanSchema);
    
    logger.info(`[TaskPlanEngine] Generated ${result.milestones.length} milestones.`, { 
      type: 'PLAN', 
      payload: { milestones: result.milestones } 
    });

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
    logger.info(`[TaskPlanEngine] Reviewing milestones and projecting context...`, { type: 'PLAN' });
    
    // 1. 執行架構審查
    const review = await this.reviewEngine.infer(state as any, PlanReviewSchema, {
      variables: { items: state.planning.milestones }
    });

    logger.info(`[TaskPlanEngine] Review Score: ${review.score}/10. Rationale: ${review.rationale}`, { type: 'PLAN' });

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
   * [Node] 任務展開 (DAG) - 遍歷所有里程碑並生成完整的任務圖
   */
  async expandMilestone(state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> {
    const finalGraph = new TaskGraph();
    let prevMilestoneTaskIds: string[] = [];

    logger.info(`[TaskPlanEngine] Starting full expansion for ${state.planning.milestones.length} milestones.`, { type: 'PLAN' });

    for (let i = 0; i < state.planning.milestones.length; i++) {
      const milestone = state.planning.milestones[i];
      const milestonePrefix = `m${i + 1}_`;
      logger.info(`[TaskPlanEngine] Expanding milestone [${i + 1}/${state.planning.milestones.length}]: ${milestone}`, { type: 'PLAN' });

      const result = await this.expansionEngine.infer(state as any, TaskExpandResponseSchema, {
        variables: {
          milestone: milestone,
          projected_context: JSON.stringify(state.planning.projectedContext),
          available_agents: JSON.stringify(state.metadata?.available_agents || [])
        }
      });

      // 1. 映射任務 ID 與依賴 (加上前綴確保全局唯一)
      const currentMilestoneNodes: ITaskNode[] = result.nodes.map(n => {
        const originalId = n.id || uuidv4();
        const globalId = `${milestonePrefix}${originalId}`;
        
        // 映射依賴 ID
        const internalDeps = (n.dependencies || []).map(d => `${milestonePrefix}${d}`);
        
        // 如果該任務沒有內部分依賴，則依賴於上一個里程碑的所有末端任務 (達成階段同步)
        const globalDeps = (internalDeps.length > 0) ? internalDeps : [...prevMilestoneTaskIds];
          
        return {
          ...n,
          id: globalId,
          dependencies: globalDeps,
          status: 'pending' as const
        };
      });

      // 2. 將任務加入 TaskGraph 類實例進行維護
      currentMilestoneNodes.forEach(node => finalGraph.addTask(node.id, node));
      
      // 3. 建立依賴關係 (TaskGraph 會自動更新入度)
      currentMilestoneNodes.forEach(node => {
        node.dependencies.forEach(depId => {
          try {
            finalGraph.addDependency(depId, node.id);
          } catch (e) {
            logger.warn(`[TaskPlanEngine] Failed to add dependency ${depId} -> ${node.id}: ${(e as Error).message}`);
          }
        });
      });

      // 更新 prevMilestoneTaskIds 為當前里程碑的所有任務
      prevMilestoneTaskIds = currentMilestoneNodes.map(n => n.id);
    }

    const taskGraphData = finalGraph.toJSON();
    // 補齊 milestones 資訊
    taskGraphData.milestones = state.planning.milestones;
    taskGraphData.currentMilestoneIndex = state.planning.milestones.length - 1;

    logger.info(`[TaskPlanEngine] Full expansion completed. Total tasks: ${finalGraph.size}`, { 
      type: 'PLAN', 
      payload: { 
        totalTasks: finalGraph.size,
        tasks: taskGraphData.nodes.map(n => ({ id: n.id, goal: n.goal, agent: n.assignedAgentId || n.assignedRole, deps: n.dependencies }))
      } 
    });

    return {
      planning: { ...state.planning, taskGraph: taskGraphData }
    };
  }

  async replan(state: IAgentState, failedNodeId: string, error: string): Promise<Partial<IAgentState>> {
    const failedNode = state.planning.taskGraph?.nodes.find(n => n.id === failedNodeId);
    
    logger.info(`[TaskPlanEngine] Requesting replan for failed task: ${failedNodeId}`, { 
      type: 'PLAN', 
      payload: { error } 
    });

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

    logger.info(`[TaskPlanEngine] Replanning completed. New graph has ${nodes.length} nodes.`, { type: 'PLAN' });

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
