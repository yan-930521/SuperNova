import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { BaseTool } from '../BaseTool';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';

/**
 * TaskListTool
 * 職責：僅負責獲取系統中當前的任務鏈及其所有任務的狀態清單。
 */
export class TaskListTool extends BaseTool {
  constructor() {
    super(
      'task_list',
      'List all current task chains and the status of all tasks within them.',
      'TIER_1',
      ['orchestration'],
      z.object({
        chainId: z.string().optional().describe('Optional ID of a specific chain to list tasks for.')
      })
    );
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
          completedCount: c.nodes.filter(n => n.status === 'completed').length
        }))
      };
    }
  }
}
