import { z } from 'zod';

import { ContextService } from '../../application/context/ContextService';
import { AgentEvent, AgentEvents, IAgentEventPayload, IEventBus } from '../../core/messaging/IBus';
import { ModelPreset } from '../../infra/types/agent';
import { BaseAgent } from '../BaseAgent';

/**
 * CheckingAgent (審核者)
 * 職責: 驗證任務產出是否符合 Planning 定義的驗證標準。
 */
export class CheckingAgent extends BaseAgent {
  constructor(id: string, bus: IEventBus<IAgentEventPayload>) {
    super(id, bus);
  }

  protected setupSubscriptions(): void {
    this.bus.subscribe(AgentEvents.Checking.Start, this.onCheckStart.bind(this));
  }

  private async onCheckStart(event: AgentEvent): Promise<void> {
    const { sessionId, traceId, taskId } = event.payload;
    this.log(`Checking task: ${taskId}`, 'info', { traceId, sessionId });

    try {
      const contextService = this.runtime.container.resolve<ContextService>('ContextService');
      const engine = this.runtime.modelRegistry.getModel(ModelPreset.EVAL);

      const systemPrompt = contextService.renderPrompt('CheckingAgent', event.payload, []);

      // 定義簡單的審核 Schema
      const CheckSchema = z.object({
        pass: z.boolean().describe("是否通過審核"),
        rationale: z.string().describe("審核理由或改進建議")
      });

      const result = await engine.withSystemPrompt(systemPrompt).infer({
        goal: "Verify task output",
        currentTask: `Checking ${taskId}`,
        messages: [{ role: 'user', content: `Please verify the output of task ${taskId}.` } as any],
        metadata: { traceId, sessionId, taskId }
      }, CheckSchema);

      if (result.pass) {
        this.log(`Task ${taskId} PASSED check.`, 'info', { traceId, sessionId });
        this.bus.publish({
          type: AgentEvents.Checking.Pass,
          timestamp: Date.now(),
          payload: { sessionId, traceId, taskId, reason: result.rationale }
        });
      } else {
        this.log(`Task ${taskId} FAILED check: ${result.rationale}`, 'error', { traceId, sessionId });
        this.bus.publish({
          type: AgentEvents.Checking.Fail,
          timestamp: Date.now(),
          payload: { sessionId, traceId, taskId, error: result.rationale }
        });
      }

    } catch (error) {
      this.log(`Checking failed: ${error}`, 'error', { traceId, sessionId });
      this.bus.publish({
        type: AgentEvents.Checking.Fail,
        timestamp: Date.now(),
        payload: { sessionId, traceId, taskId, error: String(error) }
      });
    }
  }
}
