import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { z } from 'zod';
import { ContextService } from '../../application/context/ContextService';
import { BaseAgent } from '../BaseAgent';

/**
 * ActingAgent (改善者)
 * 職責: 總結 PDCA 循環、標準化 SOP 並沈澱知識。
 */
export class ActingAgent extends BaseAgent {
  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
  }

  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Acting.Start, this.onActStart.bind(this));
  }

  private async onActStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId } = event.payload;
    this.log(`Acting/Reflecting on task: ${taskId}`, 'info', { traceId, sessionId });

    try {
      const contextService = this.runtime.container.resolve<ContextService>('ContextService');
      const engine = this.runtime.modelRegistry.getModel(ModelPreset.SMART);

      const systemPrompt = contextService.renderPrompt('ActingAgent', event.payload, []);

      // 定義沈澱 Schema
      const ReflectionSchema = z.object({
        sop_update: z.string().optional().describe("建議更新或新增的 SOP 內容 (Markdown)"),
        facts_extracted: z.array(z.string()).describe("從本次任務中提取的驗證事實"),
        improvement_briefing: z.string().optional().describe("若任務失敗，給予下一輪的具體改進建議")
      });

      const result = await engine.withSystemPrompt(systemPrompt).infer({
        goal: "Standardize and Reflect",
        currentTask: `Reflecting on ${taskId}`,
        messages: [{ role: 'user', content: `Please summarize lessons and extract facts from task ${taskId}.` } as any],
        metadata: { traceId, sessionId, taskId }
      }, ReflectionSchema);

      this.log(`Reflection completed. Extracted ${result.facts_extracted.length} facts.`, 'info', { traceId, sessionId });

      // TODO: 將事實寫入 L2 Fact, 將 SOP 寫入 L3 (需調用 MemoryService)

      this.bus.publish({
        type: AgentEvents.Acting.Finish,
        timestamp: Date.now(),
        payload: { 
          sessionId, 
          traceId, 
          taskId, 
          content: result.sop_update || 'Reflection complete.' 
        }
      });

    } catch (error) {
      this.log(`Acting failed: ${error}`, 'error', { traceId, sessionId });
      this.bus.publish({
        type: AgentEvents.Acting.Fail,
        timestamp: Date.now(),
        payload: { sessionId, traceId, taskId, error: String(error) }
      });
    }
  }
}
