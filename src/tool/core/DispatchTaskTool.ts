import { z } from 'zod';
import { AgentEvents, IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';
import { IdGenerator } from '../../utils/IdGenerator';

/**
 * DispatchTaskTool
 * 負責將經過路由判定的任務正式提交給系統進行初始化。
 * 此工具是 SupervisorAgent 啟動 PDCA 流程的核心手段。
 */
export class DispatchTaskTool extends BaseTool {
  constructor() {
    super({
      name: 'dispatch_task',
      description: "Initialize a new task with a specific template type (PDCA flow). This is the primary way for SupervisorAgent to start execution.",
      category: 'core',
      safety_tier: 'TIER_2',
      required_capabilities: ['planning'],
      schema: z.object({
        goal: z.string().describe('The primary objective of the task.'),
        description: z.string().describe(`A fully self-contained, execution-ready mission spec. 
Must contain:
1. Objective clarification (what "done" means)
2. Required inputs or data (or explicit UNKNOWN)
3. Constraints and rules
4. Expected output format
5. Success criteria / verification condition`),
        templateType: z.enum(['Instant', 'Simple', 'Standard', 'Complex', 'Exploratory', 'Emergency', 'Recursive'])
          .describe('The PDCA template to use for this task.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { goal, description, templateType } = input;
    const { sessionId, traceId } = context;
    const runtime = GlobalRuntime.getInstance();

    try {
      // 1. 生成新的 Span ID，標識此分派動作
      const spanId = IdGenerator.span('sys');

      // 2. 發布 Flow.Initialize 事件，觸發 TaskService 建立任務實體與狀態機
      runtime.eventBus.publish({
        type: AgentEvents.Flow.Initialize,
        timestamp: Date.now(),
        payload: {
          sessionId,
          traceId,
          spanId,
          parentSpanId: context.metadata?.spanId,
          goal,
          content: description,
          templateType,
          metadata: {
            requester: context.agentId,
            dispatchedAt: new Date().toISOString(),
            ...context.metadata
          }
        }
      });

      return {
        status: "success",
        message: `Task dispatch request submitted successfully. Template: ${templateType}`,
        taskId: null, // 異步執行，ID 將由 TaskService 在事件處理中生成
        sessionId,
        traceId,
        spanId,
        templateType
      };
    } catch (error: any) {
      return {
        status: "failed",
        message: `Failed to dispatch task: ${error.message || String(error)}`
      };
    }
  }
}
