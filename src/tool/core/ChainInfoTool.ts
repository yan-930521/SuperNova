import { z } from 'zod';

import { TaskService } from '../../../src_bk/TaskService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * ChainInfoTool
 * 職責：獲取特定任務鏈的全局狀態、里程碑進度與系統指令。
 */
export class ChainInfoTool extends BaseTool {
  constructor() {
    super({
      name: 'chain_info',
      description: 'Get high-level status and milestone progress of a specific task chain. Use this to check if a chain is still planning or stuck.',
      category: 'core',
      safety_tier: 'TIER_1',
      required_capabilities: ['orchestration'],
      schema: z.object({
        chainId: z.string().describe('The ID of the task chain.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { chainId } = input;
    const runtime = GlobalRuntime.getInstance();
    
    // 從 TaskService 獲取狀態
    const taskService = runtime.container.resolve<TaskService>('TaskService');
    const chainSummary = taskService.getChainStatus(chainId);
    
    if (!chainSummary) {
      return {
        status: "error",
        message: `Chain ${chainId} not found.`
      };
    }

    const tasks = await taskService.getChainTasks(chainId);
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    
    let systemInstruction = "";
    if (chainSummary.status === 'planning') {
      systemInstruction = "SYSTEM STATUS: PLANNING. The task graph is being generated. [INSTRUCTION]: DO NOT poll this chain or its tasks again in this turn. Tell the user you are working on it and stop.";
    } else if (chainSummary.status === 'stuck') {
      systemInstruction = "SYSTEM STATUS: STUCK. The system has reached its self-healing limit. [INSTRUCTION]: Please analyze the last task failure and ask the user for manual intervention.";
    }

    return {
      chainId: chainSummary.chainId,
      goal: chainSummary.goal,
      status: chainSummary.status,
      planning_document: chainSummary.planningDocument,
      progress: {
        totalTasks: tasks.length,
        completedTasks: completedCount,
        percentage: tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0
      },
      message: systemInstruction || "Chain is active. Monitor individual tasks for details. Read 'planning_document' for strategy."
    };
  }
}
