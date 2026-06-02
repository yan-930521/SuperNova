import { HumanMessage } from '@langchain/core/messages';

import { ILifecycle } from '../../core/lifecycle/ILifecycle';
import { Commands, Events, ICommand, ICommandBus, IEventBus } from '../../core/messaging/IBus';
import { recorder } from '../../infra/LogManager';
import { InferenceEngine, ModelRegistry } from '../../infra/ModelRegistry';
import { AgentType, ModelPreset } from '../../infra/types/agent';
import { TodoListResponseSchema } from '../../schemas/agent/AgentOutputSchemas';
import { PromptLoader } from '../../utils/PromptLoader';
import { AgentService } from '../agent/AgentService';

/**
 * 規劃目標指令的 Payload
 */
export interface IPlanGoalPayload {
  sessionId: string;
  chainId: string;
  goal: string;
  description: string;
}

/**
 * 啟動規劃指令類別
 */
export class PlanGoalCommand implements ICommand<Commands.Task.Plan> {
  readonly type = Commands.Task.Plan;
  constructor(public readonly payload: IPlanGoalPayload) { }
}

/**
 * PlanningCoordinator (規劃協調官)
 * 負責將模糊的高階目標轉化為具體的任務圖 (TaskGraph)。
 * 它是應用層的編排者，協調 LLM 推理引擎執行複雜的規劃邏輯。
 */
export class PlanningCoordinator implements ILifecycle {
  /** 推理引擎 */
  planningEngine!: InferenceEngine;

  constructor(
    private readonly commandBus: ICommandBus,
    private readonly eventBus: IEventBus,
    private readonly modelRegistry: ModelRegistry,
    private readonly agentService: AgentService
  ) { }

  /**
   * 生命週期：初始化，註冊規劃指令處理器
   */
  async initialize(): Promise<void> {
    this.commandBus.registerHandler(Commands.Task.Plan, this.handlePlanGoal.bind(this));

    const promptTemplate = PromptLoader.load('prompts/planning/plan_todolist.md');

    // 加載規劃提示詞模板 (保留原始模板格式 {goal}, {description}, {available_agents})
    this.planningEngine = this.modelRegistry.getModel(ModelPreset.SMART).withSystemPrompt(promptTemplate)

    recorder.info('[PlanningCoordinator] Initialized', { type: 'SYSTEM' });
  }

  async start(): Promise<void> {
    recorder.info('[PlanningCoordinator] Started', { type: 'SYSTEM' });
  }

  async stop(): Promise<void> {
    recorder.info('[PlanningCoordinator] Stopped', { type: 'SYSTEM' });
  }

  /**
   * 處理規劃請求
   */
  private async handlePlanGoal(command: PlanGoalCommand): Promise<any> {
    const { sessionId, chainId, goal, description } = command.payload;

    recorder.info(`[PlanningCoordinator] Planning goal for chain: ${chainId}`, {
      type: 'SYSTEM',
      session_id: sessionId
    });

    try {
      // 1. 準備環境資訊
      const availableAgents = this.agentService.getAllAgents()
      .filter((agent) => agent.type !== String(AgentType.MAIN_AGENT))
        .map((a: any) => `- ID: ${a.id} (${a.role}): ${a.capabilities.join(', ')}`)
        .join('\n');

      // 2. 呼叫推理引擎 (由內部 invoke 進行模板變數替換)
      const result = await this.planningEngine.infer({
        goal,
        description,
        currentTask: "Goal Decomposition & Phased Planning",
        messages: [new HumanMessage(`Please decompose this goal into phased tasks: ${goal}`)],
        thoughtTree: { nodes: [], rootId: null, activeNodeId: null, iterationCount: 0 },
        planning: { milestones: [], currentMilestoneIdx: 0, taskGraph: null, projectedContext: {} },
        lastEvaluations: [],
        errors: []
      }, TodoListResponseSchema, {
        variables: {
          available_agents: availableAgents // 傳遞給模板替換
        }
      });

      // 3. 轉換分階段數據為具備依賴關係的扁平列表 (用於相容現有 TaskGraph 邏輯)
      const flatTasks: any[] = [];
      let previousPhaseTaskIds: string[] = [];

      // 建立舊 ID 到新 UUID 的映射表
      const idMap = new Map<string, string>();

      // 第一遍掃描：為所有任務產生 UUID
      for (const phase of result.phases) {
        for (const taskNode of phase) {
          idMap.set(taskNode.id, crypto.randomUUID());
        }
      }

      for (let i = 0; i < result.phases.length; i++) {
        const currentPhase = result.phases[i];
        const currentPhaseTaskIds: string[] = [];

        for (const taskNode of currentPhase) {
          const newId = idMap.get(taskNode.id)!;
          
          // 如果 LLM 有提供 dependencies，嘗試映射它們
          let mappedDependencies: string[] = [];
          // if (taskNode.dependencies && Array.isArray(taskNode.dependencies)) {
          //   for (const depId of taskNode.dependencies) {
          //     if (idMap.has(depId)) {
          //       mappedDependencies.push(idMap.get(depId)!);
          //     }
          //   }
          // }

          // 如果沒有指定依賴，或者我們強制採階段依賴，則補上前一階段的 ID
          // 這裡保留原本的邏輯：預設依賴於前一階段的所有任務
          const finalDependencies = mappedDependencies.length > 0 
            ? mappedDependencies 
            : [...previousPhaseTaskIds];

          const taskWithDeps = {
            ...taskNode,
            id: newId,
            dependencies: finalDependencies
          };
          flatTasks.push(taskWithDeps);
          currentPhaseTaskIds.push(newId);
        }

        previousPhaseTaskIds = currentPhaseTaskIds;
      }

      recorder.info(`[PlanningCoordinator] Generated plan with ${result.phases.length} phases and ${flatTasks.length} total tasks`, { type: 'SYSTEM' });

      // 4. 發布任務圖已建立事件
      this.eventBus.publish({
        type: Events.Task.Created,
        timestamp: Date.now(),
        payload: {
          chainId,
          sessionId,
          goal,
          nodes: flatTasks,
          planningDocument: result.planning_document
        }
      });

      return { success: true, taskCount: flatTasks.length, phaseCount: result.phases.length };

    } catch (error) {
      recorder.error(`[PlanningCoordinator] Planning failed for chain: ${chainId} `, {
        type: 'SYSTEM',
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }
}
