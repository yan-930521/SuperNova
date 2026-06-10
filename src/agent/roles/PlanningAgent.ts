import { ContextService } from '../../application/context/ContextService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { InferenceEngine } from '../../infra/ModelRegistry';
import { ModelPreset } from '../../infra/types/agent';
import { TaskDTO, TaskStatus } from '../../infra/types/task';
import { TodoListResponseSchema } from '../../schemas/agent/AgentOutputSchemas';
import { IdGenerator } from '../../utils/IdGenerator';
import { PromptLoader } from '../../utils/PromptLoader';
import { BaseAgent } from '../BaseAgent';

/**
 * PlanningAgent (規劃師) - SuperNova 0.4.0
 * 職責: 接收目標並將其拆解為具備分形結構的任務圖 (subGraph)。
 * 特點: 支援引擎預熱緩存與 SOP 標準化流程對齊。
 */
export class PlanningAgent extends BaseAgent {
  /** 規劃推理引擎 */
  private planningEngine: InferenceEngine;

  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
    this.planningEngine = this.initEngine(ModelPreset.SMART, 'prompts/identity/planning_agent.md');
  }

  protected setupSubscriptions(): void {
    // 監聽規劃啟動事件
    this.bus.subscribe(AgentEvents.Phase.Start, (e) => {
      if (e.payload.phase === 'PLANNING') {
        this.onStart(e);
      }
    });
  }

  /**
   * 處理規劃啟動：執行分形拆解邏輯
   */
  private async onStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId, content } = event.payload;

    this.log(`Planning started for goal: ${content}`, 'info', { traceId, sessionId });

    try {
      // 1. TODO: 整合 SOP (L3) 檢索邏輯
      // 在正式推理前，應先依據 goal 關鍵字從 storage.sops_dir 檢索匹配的 SOP

      // 2. 準備系統提示詞 (包含 Identity 貫通與黑板上下文)
      const identityPrompt = PromptLoader.load('prompts/identity/planning_agent.md');
      const systemPrompt = await this.getSystemPrompt(identityPrompt, event.payload);

      // 3. 調用預熱好的引擎進行分階段拆解 (Goal Decomposition)
      const result = await this.planningEngine.withSystemPrompt(systemPrompt).infer({
        goal: content || 'No goal',
        currentTask: "Fractal Decomposition",
        messages: [], 
        metadata: { traceId, sessionId, parentTaskId: taskId }
      }, TodoListResponseSchema);

      // 4. 處理任務 ID 與 依賴圖建構 (ID Mapping)
      // 確保所有子任務在系統中具備唯一且可追蹤的 ID
      const flatTasks: TaskDTO[] = [];
      const idMap = new Map<string, string>();

      // 第一遍：預生成所有 UUID
      for (const phase of result.phases) {
        for (const taskNode of phase) {
          const newId = IdGenerator.task();
          idMap.set(taskNode.id, newId);
        }
      }

      // 第二遍：建立依賴關係 (預設依賴於前一階段的所有任務)
      let previousPhaseTaskIds: string[] = [];
      for (const phase of result.phases) {
        const currentPhaseTaskIds: string[] = [];
        for (const taskNode of phase) {
          const newId = idMap.get(taskNode.id)!;
          
          flatTasks.push({
            ...taskNode,
            id: newId,
            sessionId,
            traceId: traceId!, // 確保承接至子任務
            status: 'pending',
            history: [],
            dependencies: [...previousPhaseTaskIds],
            metadata: { parentTaskId: taskId },
            flow: {
              templateType: 'Simple',
              currentPhase: 'READY',
              phases: ['DOING', 'CHECKING', 'FINISH'],
              history: [],
              isEscalated: false
            }
          });
          currentPhaseTaskIds.push(newId);
        }
        previousPhaseTaskIds = currentPhaseTaskIds;
      }

      this.log(`Fractal plan generated: ${flatTasks.length} sub-tasks in ${result.phases.length} phases.`, 'info', { traceId, sessionId });

      // 5. 發布規劃完成事件
      this.bus.publish({
        type: AgentEvents.Phase.Finish,
        timestamp: Date.now(),
        payload: {
          ...this.inheritPayload(event.payload, 'pa'),
          taskId: taskId, // 母任務 ID
          content: result.planning_document,
          phase: 'PLANNING',
          metadata: {
            subGraph: {
              nodes: flatTasks,
              phases: result.phases.map((_: any, i: number) => `Phase ${i + 1}`),
              currentPhaseIndex: 0
            }
          }
        }
      });

    } catch (error) {
      this.log(`Planning failed: ${error}`, 'error', { traceId, sessionId });
      
      // 發布失敗事件以觸發 SA 的換檔決策
      this.bus.publish({
        type: AgentEvents.Phase.Fail,
        timestamp: Date.now(),
        payload: { 
          ...this.inheritPayload(event.payload, 'pa'),
          taskId, 
          phase: 'PLANNING',
          error: String(error)
        }
      });
    }
  }
}
