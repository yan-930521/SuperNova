import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
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
    
    // 從 TaskManager 獲取原始狀態
    // 注意：TaskManager.ts 中儲存鏈狀態的是私有成員 chains，我們需要透過公開方法存取
    const chainSummary = runtime.taskManager.getChainStatus(chainId);
    
    if (!chainSummary) {
      return {
        status: "error",
        message: `Chain ${chainId} not found.`
      };
    }

    // 獲取更深層的進度資訊 (需要從 runtime.taskManager 獲取內部的 ITaskChainState)
    // 這裡我們暫時擴充 getChainStatus 沒提供但必要的欄位 (如果 TaskManager 有暴露的話)
    // 根據 TaskManager.ts，getChainStatus 回傳 IChainStatusSummary
    
    const tasks = runtime.taskManager.getChainTasks(chainId);
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
