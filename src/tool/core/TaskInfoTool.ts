import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * TaskInfoTool
 * 職責：獲取特定任務節點的詳細執行資訊與結果。
 */
export class TaskInfoTool extends BaseTool {
  constructor() {
    super({
      name: 'task_info',
      description: 'Get detailed information about a specific task node.',
      category: 'core',
      safety_tier: 'TIER_1',
      required_capabilities: ['orchestration'],
      schema: z.object({
        chainId: z.string().describe('The ID of the task chain.'),
        taskId: z.string().describe('The ID of the specific task node.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { chainId, taskId } = input;
    const runtime = GlobalRuntime.getInstance();
    
    const task = runtime.taskManager.getTaskInfo(chainId, taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found in chain ${chainId}.`);
    }

    return {
      id: task.id,
      goal: task.goal,
      status: task.status,
      assignedAgentId: task.assignedAgentId,
      result: task.result,
      dependencies: task.dependencies
    };
  }
}
