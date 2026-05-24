import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * TaskDispatcherTool
 * 負責將高層次的目標提交給 TaskManager，觸發自動規劃與並行執行。
 */
export class TaskDispatcherTool extends BaseTool {
  constructor() {
    super(
      'task_dispatcher',
      'Submit a high-level goal to the system for automatic planning and parallel execution.',
      'TIER_2',
      ['planning'],
      z.object({
        goal: z.string().describe('The overall objective to achieve.')
      })
    );
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { goal } = input;
    const { sessionId } = context; // 直接從系統提供的上下文獲取真實 ID
    const runtime = GlobalRuntime.getInstance();
    
    // 提交任務，使用 Agent 的 ID 作為請求者
    const result = await runtime.taskManager.submit(goal, sessionId, context.agentId);
    
    return {
      message: "Goal submitted successfully. Planning initiated.",
      chainId: result.chainId,
      traceId: result.traceId
    };
  }
}
