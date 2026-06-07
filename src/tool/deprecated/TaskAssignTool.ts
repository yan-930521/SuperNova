import { z } from 'zod';

import { TaskService } from '../../../src_bk/TaskService';
import { AgentService } from '../../application/agent/AgentService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * TaskAssignTool (已廢棄，僅供過渡期參考)
 * 職責：手動指派特定的任務節點給指定的代理。
 */
export class TaskAssignTool extends BaseTool {
  constructor() {
    super({
      name: 'task_assign',
      description: 'Assign a specific task to an agent; you must be authorized to coordinate the target agent and MUST call `agent_list` first to verify the target agent exists and is available before assignment.',
      category: 'core',
      safety_tier: 'TIER_2',
      required_capabilities: ['orchestration'],
      schema: z.object({
        chainId: z.string().describe('The ID of the task chain.'),
        taskId: z.string().describe('The ID of the task to assign.'),
        agentId: z.string().describe('The ID of the agent to assign the task to.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { taskId, agentId: targetAgentId } = input;
    const runtime = GlobalRuntime.getInstance();
    
    const agentService = runtime.container.resolve<AgentService>('AgentService');
    const taskService = runtime.container.resolve<TaskService>('TaskService');

    // 1. 權限驗證
    const callingAgent = agentService.getAgent(context.agentId);
    if (callingAgent && callingAgent.availableAgents && callingAgent.availableAgents.length > 0) {
      if (!callingAgent.availableAgents.includes(targetAgentId)) {
        throw new Error(`Access denied: You are not authorized to coordinate Agent "${targetAgentId}".`);
      }
    }

    // 2. 執行指派
    await taskService.assignTask(taskId, targetAgentId);
    
    return {
      message: `Task ${taskId} has been assigned to Agent ${targetAgentId}.`,
      status: "success"
    };
  }
}
