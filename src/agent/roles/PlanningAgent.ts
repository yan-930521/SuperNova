import { AgentEvent, AgentEvents, Events, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { TodoListResponseSchema } from '../../schemas/agent/AgentOutputSchemas';
import { ContextService } from '../../application/context/ContextService';
import { BaseAgent } from '../BaseAgent';

/**
 * PlanningAgent (規劃師)
 * 職責: 接收目標並將其拆解為具備依賴關係的任務圖 (TaskGraph)。
 */
export class PlanningAgent extends BaseAgent {
  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
  }

  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Planning.Start, this.onPlanStart.bind(this));
  }

  private async onPlanStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, goal } = event.payload;
    this.log(`Planning started for goal: ${goal}`, 'info', { traceId, sessionId });

    try {
      // 1. 獲取必要服務
      const contextService = this.runtime.container.resolve<ContextService>('ContextService');
      const engine = this.runtime.modelRegistry.getModel(ModelPreset.SMART);

      // 2. 渲染指令 (初始黑板為空，傳入空列表)
      const systemPrompt = contextService.renderPrompt('PlanningAgent', event.payload, []);

      // 3. 執行推理
      const result = await engine.withSystemPrompt(systemPrompt).infer({
        goal: goal || 'No goal',
        currentTask: "Goal Decomposition",
        messages: [], // 規劃通常是單次對話
        metadata: { traceId, sessionId }
      }, TodoListResponseSchema);

      // 4. 扁平化與處理任務 ID (確保唯一性)
      const flatTasks: any[] = [];
      const idMap = new Map<string, string>();

      for (const phase of result.phases) {
        for (const taskNode of phase) {
          const newId = crypto.randomUUID();
          idMap.set(taskNode.id, newId);
        }
      }

      let previousPhaseTaskIds: string[] = [];
      for (const phase of result.phases) {
        const currentPhaseTaskIds: string[] = [];
        for (const taskNode of phase) {
          const newId = idMap.get(taskNode.id)!;
          
          // 預設依賴於前一階段的所有任務
          const finalDependencies = [...previousPhaseTaskIds];

          flatTasks.push({
            ...taskNode,
            id: newId,
            dependencies: finalDependencies
          });
          currentPhaseTaskIds.push(newId);
        }
        previousPhaseTaskIds = currentPhaseTaskIds;
      }

      this.log(`Plan generated with ${result.phases.length} phases and ${flatTasks.length} tasks.`, 'info', { traceId, sessionId });

      // 5. 發布任務圖已建立事件 (廣播給 TaskService/TaskScheduler)
      this.bus.publish({
        type: Events.Task.Created as any, // 轉換為 EventBus 支援的字串
        timestamp: Date.now(),
        payload: {
          chainId: traceId, // 以 traceId 作為任務鏈 ID
          sessionId,
          goal,
          nodes: flatTasks,
          planningDocument: result.planning_document,
          traceId
        }
      } as any);

    } catch (error) {
      this.log(`Planning failed: ${error}`, 'error', { traceId, sessionId });
      this.bus.publish({
        type: AgentEvents.Planning.Fail,
        timestamp: Date.now(),
        payload: { sessionId, traceId, error: String(error) }
      });
    }
  }
}
