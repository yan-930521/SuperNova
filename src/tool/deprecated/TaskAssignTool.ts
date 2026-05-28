import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * TaskAssignTool
 * 職責：手動指派特定的任務節點給指定的代理。
 * 2.0 增強：驗證指派的 Agent 是否在呼叫者的可用名單內。
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
    const { chainId, taskId, agentId: targetAgentId } = input;
    const runtime = GlobalRuntime.getInstance();
    
    // 1. 權限驗證：檢查指派的 Agent 是否在呼叫者的可用名單內
    const callingAgent = runtime.agentManager.getAgent(context.agentId);
    if (callingAgent && callingAgent.availableAgents && callingAgent.availableAgents.length > 0) {
      if (!callingAgent.availableAgents.includes(targetAgentId)) {
        throw new Error(`Access denied: You are not authorized to coordinate Agent "${targetAgentId}". Available agents: ${callingAgent.availableAgents.join(', ')}`);
      }
    }

    // 2. 執行指派
    await runtime.taskManager.assignTask(chainId, taskId, targetAgentId);
    
    return {
      message: `Task ${taskId} in chain ${chainId} has been assigned to Agent ${targetAgentId}.`,
      status: "success"
    };
  }
}
