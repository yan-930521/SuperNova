import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * TaskListTool
 * 職責：僅負責獲取系統中當前的任務鏈及其所有任務的狀態清單。
 */
export class TaskListTool extends BaseTool {
  constructor() {
    super({
      name: 'task_list',
      description: 'List all current task chains and the status of all tasks within them.',
      category: 'core',
      safety_tier: 'TIER_1',
      required_capabilities: ['orchestration'],
      schema: z.object({
        chainId: z.string().optional().describe('Optional ID of a specific chain to list tasks for.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { chainId } = input;
    const runtime = GlobalRuntime.getInstance();
    
    if (chainId) {
      const tasks = runtime.taskManager.getChainTasks(chainId);
      return {
        chainId,
        totalTasks: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          goal: t.goal,
          status: t.status,
          assignedAgentId: t.assignedAgentId
        }))
      };
    } else {
      const chains = runtime.taskManager.listChains();
      return {
        totalChains: chains.length,
        chains: chains.map(c => ({
          chainId: c.chainId,
          status: c.status,
          taskCount: c.nodes.length,
          completedCount: c.nodes.filter((n: any) => n.status === 'completed').length
        }))
      };
    }
  }
}
