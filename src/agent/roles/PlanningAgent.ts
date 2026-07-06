import { z } from 'zod';

import { MemoryService } from '../../application/memory/MemoryService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { InferenceEngine } from '../../infra/ModelRegistry';
import { ModelPreset } from '../../infra/types/agent';
import { TaskDTO } from '../../infra/types/task';
import {
    DecompositionSchema, DependencyInferenceSchema, GoalAnalysisSchema, PlanningDocumentSchema,
    VerificationBindingSchema
} from '../../schemas/agent/PlanningSchemas';
import { IdGenerator } from '../../utils/IdGenerator';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseAgent } from '../BaseAgent';

/**
 * PlanningAgent (規劃師) - SuperNova 0.6.0
 * 職責: 執行編譯級規劃管線 (6-Step Pipeline)。
 * 特點: Step 5 使用無狀態 ReAct 循環進行交互式除錯。
 */
export class PlanningAgent extends BaseAgent {
  /** 規劃推理引擎 */
  private planningEngine: InferenceEngine;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.planningEngine = this.initEngine(ModelPreset.SMART, 'prompts/planning/main_compiler.md');
  }

  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Phase.Start, (e) => {
      if (e.payload.phase === 'PLANNING') {
        this.onStart(e);
      }
    });
  }

  /**
   * 核心編譯管線：執行規劃管線
   */
  private async onStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId, content } = event.payload;
    const isRoot = !event.payload.metadata?.parentTaskId;
    
    this.log(`[PlanningAgent] Starting 6-Step Pipeline (${isRoot ? 'Root' : 'Sub'}): ${content}`, 'info', { traceId, sessionId });

    try {
      // Step 1: Goal Analysis
      const analysis = await this.analyzeGoal(content || '', { traceId, sessionId });

      // Step 2: Task Decomposition
      const decomposition = await this.decomposeTask(content || '', analysis, isRoot, { traceId, sessionId });

      // Step 3: Dependency Inference
      const dependencies = await this.inferDependencies(content || '', decomposition.nodes, { traceId, sessionId });

      // Step 4: Verification Binding
      const bindings = await this.bindVerification(content || '', decomposition.nodes, { traceId, sessionId });

      // Step 5: Consistency Refinement (Stateless ReAct Loop)
      const finalDraft = await this.refineConsistency(content || '', { 
        nodes: decomposition.nodes, 
        dependency_map: dependencies.dependency_map,
        bindings: bindings.bindings,
        traceId, sessionId 
      });

      // Step 6: Final Documentation & Structural Assembly
      const planningDocument = await this.generatePlanningDocument(content || '', { 
        analysis, 
        decomposition: { nodes: finalDraft.nodes }, 
        dependencies: { dependency_map: finalDraft.dependency_map }, 
        bindings: { bindings: finalDraft.bindings }, 
        traceId, sessionId 
      });
      this.log(`[PlanningAgent] Step 6A: Planning Document generated.`, 'info', { traceId, sessionId });

      const flatTasks = this.assembleTaskGraph(finalDraft.nodes, { dependency_map: finalDraft.dependency_map }, { bindings: finalDraft.bindings }, sessionId, traceId!, taskId!);
      this.log(`[PlanningAgent] Step 6B: Task graph assembled with ${flatTasks.length} nodes.`, 'info', { traceId, sessionId });

      // 發布結果
      this.log(`[PlanningAgent] Publishing final planning result...`, 'info', { traceId, sessionId });
      this.bus.publish({
        type: AgentEvents.Phase.Finish,
        timestamp: Date.now(),
        payload: {
          ...this.inheritPayload(event.payload, 'pa'),
          taskId: taskId,
          content: planningDocument,
          phase: 'PLANNING',
          metadata: {
            subGraph: {
              nodes: flatTasks,
              phases: ['Execution Phase'],
              currentPhaseIndex: 0
            }
          }
        }
      });

    } catch (error) {
      this.log(`Planning failed: ${error}`, 'error', { traceId, sessionId });
      this.bus.publish({
        type: AgentEvents.Phase.Fail,
        timestamp: Date.now(),
        payload: { ...this.inheritPayload(event.payload, 'pa'), taskId, phase: 'PLANNING', error: String(error) }
      });
    }
  }

  /**
   * Step 1: 目標分析
   */
  private async analyzeGoal(goal: string, context: { traceId: string | undefined, sessionId: string }): Promise<z.infer<typeof GoalAnalysisSchema>> {
    this.log(`[PlanningAgent] Step 1: Goal Analysis...`, 'info', context);
    return await this.planningEngine.infer({
      goal,
      currentTask: "Step 1: Goal Analysis",
      messages: [],
      metadata: context
    }, GoalAnalysisSchema);
  }

  /**
   * Step 2: 任務拆解
   */
  private async decomposeTask(goal: string, analysis: any, isRoot: boolean, context: { traceId: string | undefined, sessionId: string }): Promise<z.infer<typeof DecompositionSchema>> {
    this.log(`[PlanningAgent] Step 2: Task Decomposition...`, 'info', context);
    const strategyPrompt = isRoot 
      ? PromptLoader.load('prompts/planning/strategy_phases.md')
      : PromptLoader.load('prompts/planning/strategy_tasks.md');
    
    return await this.planningEngine
      .withSystemPrompt(strategyPrompt)
      .infer({
        goal,
        currentTask: "Step 2: Task Decomposition",
        messages: [],
        metadata: { analysis, ...context }
      }, DecompositionSchema);
  }

  /**
   * Step 3: 依賴推斷
   */
  private async inferDependencies(goal: string, nodes: any[], context: { traceId: string | undefined, sessionId: string }): Promise<z.infer<typeof DependencyInferenceSchema>> {
    this.log(`[PlanningAgent] Step 3: Dependency Inference...`, 'info', context);
    return await this.planningEngine.infer({
      goal,
      currentTask: "Step 3: Dependency Inference",
      messages: [],
      metadata: { nodes, ...context }
    }, DependencyInferenceSchema);
  }

  /**
   * Step 4: 驗證綁定
   */
  private async bindVerification(goal: string, nodes: any[], context: { traceId: string | undefined, sessionId: string }): Promise<z.infer<typeof VerificationBindingSchema>> {
    this.log(`[PlanningAgent] Step 4: Verification Binding...`, 'info', context);
    const bindingPrompt = PromptLoader.load('prompts/planning/strategy_binding.md');
    return await this.planningEngine
      .withSystemPrompt(bindingPrompt)
      .infer({
        goal,
        currentTask: "Step 4: Verification Binding",
        messages: [],
        metadata: { nodes, ...context }
      }, VerificationBindingSchema);
  }

  /**
   * Step 5: 一致性校準 (Stateless ReAct 模式)
   */
  private async refineConsistency(goal: string, context: { nodes: any[], dependency_map: any[], bindings: any[], traceId: string | undefined, sessionId: string }): Promise<any> {
    this.log(`[PlanningAgent] Step 5: Entering ReAct Refinement Loop...`, 'info', { traceId: context.traceId, sessionId: context.sessionId });
    
    // 1. 初始化 ReAct 執行引擎 (載入 RefinePlanTool)
    this.buildExecutionEngine(ModelPreset.SMART);
    
    // 2. 獲取專用提示詞
    const refinementPrompt = PromptLoader.load('prompts/planning/plan_refinement_react.md');
    
    // 3. 執行 ReAct 循環
    const result = await this.reactAgent?.invoke({
      input: `開始微調草案。
目標：${goal}
初始 Nodes: ${JSON.stringify(context.nodes, null, 2)}
初始 Dependency Map: ${JSON.stringify(context.dependency_map, null, 2)}

請開始偵錯。`,
    }, {
      configurable: {
        toolContext: {
          sessionId: context.sessionId,
          traceId: context.traceId,
          agentId: this.id
        },
        identity: refinementPrompt
      }
    });

    // 4. 解析最終產出的 JSON
    try {
      const jsonMatch = result.output.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        this.log(`[PlanningAgent] Step 5: Successfully parsed refined draft.`, 'info', { traceId: context.traceId, sessionId: context.sessionId });
        return {
          nodes: parsed.finalNodes,
          dependency_map: parsed.finalDependencyMap,
          bindings: context.bindings // 暫時保留原有的 bindings
        };
      }
    } catch (e) {
      this.log(`[PlanningAgent] Warning: Could not parse Step 5 JSON, using initial draft.`, 'warn', { traceId: context.traceId, sessionId: context.sessionId });
    }

    return { nodes: context.nodes, dependency_map: context.dependency_map, bindings: context.bindings };
  }

  /**
   * Step 6A: 生成規劃文件
   */
  private async generatePlanningDocument(goal: string, metadata: any): Promise<string> {
    this.log(`[PlanningAgent] Step 6: Generating Planning Document...`, 'info', { traceId: metadata.traceId, sessionId: metadata.sessionId });
    const result = await this.planningEngine.infer({
      goal,
      currentTask: "Final Planning Document Generation",
      messages: [],
      metadata
    }, PlanningDocumentSchema);
    return result.planning_document;
  }

  /**
   * Step 6B: 物理組裝任務圖
   */
  private assembleTaskGraph(
    nodes: any[], 
    dependencies: z.infer<typeof DependencyInferenceSchema>, 
    bindings: z.infer<typeof VerificationBindingSchema>,
    sessionId: string,
    traceId: string,
    parentTaskId: string
  ): TaskDTO[] {
    const flatTasks: TaskDTO[] = [];
    const idMap = new Map<string, string>();

    // 1. 建立節點基礎並預生成 UUID
    nodes.forEach((node: any) => {
      idMap.set(node.id, IdGenerator.task());
    });

    // 2. 獲取依賴映射與綁定映射
    const depMapLookup = new Map<string, string[]>();
    dependencies.dependency_map.forEach((d: any) => depMapLookup.set(d.source_id, d.depends_on));

    const bindingLookup = new Map<string, string>();
    bindings.bindings.forEach((b: any) => bindingLookup.set(b.node_id, b.criteria));

    // 3. 物理合成 DTO
    const finalPhases: any[][] = [nodes]; 

    let previousPhaseTaskIds: string[] = [];
    for (const phaseNodes of finalPhases) {
      const currentPhaseTaskIds: string[] = [];
      for (const node of phaseNodes) {
        const newId = idMap.get(node.id)!;
        
        const finalDeps = new Set<string>(previousPhaseTaskIds);
        const explicitDeps = depMapLookup.get(node.id) || [];
        explicitDeps.forEach(dId => {
          const uuid = idMap.get(dId);
          if (uuid) finalDeps.add(uuid);
        });

        const templateType = node.type === 'phase' ? 'Standard' : 'Simple';
        const flowPhases = templateType === 'Standard' 
          ? ['DOING', 'CHECKING', 'ACTING', 'FINISH'] 
          : ['CHECKING', 'FINISH'];

        flatTasks.push({
          id: newId,
          goal: node.goal,
          description: node.description,
          type: node.type,
          successCriteria: bindingLookup.get(node.id) || 'No criteria bound.',
          assignedAgentId: 'DoingAgent',
          sessionId,
          traceId,
          status: 'pending',
          history: [],
          dependencies: Array.from(finalDeps),
          metadata: { parentTaskId, semanticId: node.id },
          flow: {
            templateType,
            currentPhase: 'READY',
            phases: flowPhases,
            history: [],
            isEscalated: false
          }
        });
        currentPhaseTaskIds.push(newId);
      }
      previousPhaseTaskIds = currentPhaseTaskIds;
    }

    return flatTasks;
  }
}
