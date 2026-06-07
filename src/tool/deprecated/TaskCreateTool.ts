import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { TaskService } from '../../../src_bk/TaskService';
import { AgentService } from '../../application/agent/AgentService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { recorder } from '../../infra/LogManager';
import { TaskStatus } from '../../infra/types/task';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * TaskCreateTool (已廢棄，僅供過渡期參考)
 * 職責：負責在系統中真正創建任務節點。
 */
export class TaskCreateTool extends BaseTool {
	constructor() {
		super({
			name: 'task_create',
			description: 'Create a new task node in the system.',
			category: 'core',
			safety_tier: 'TIER_2',
			required_capabilities: ['orchestration'],
			schema: z.object({
				goal: z.string().describe('The specific goal of the task.'),
				description: z.string().describe('Detailed context.'),
				assignedAgentId: z.string().describe('ID of the agent.'),
				chainId: z.string().optional().describe('Chain ID.')
			})
		});
	}

	async run(input: any, context: IAgentExecuteContext): Promise<any> {
		const { goal, chainId: targetChainId, assignedAgentId, description } = input;
		const runtime = GlobalRuntime.getInstance();
    
    const taskService = runtime.container.resolve<TaskService>('TaskService');
    const agentService = runtime.container.resolve<AgentService>('AgentService');

		// 1. 權限驗證
		if (assignedAgentId) {
			const callingAgent = agentService.getAgent(context.agentId);
			if (callingAgent && callingAgent.availableAgents && callingAgent.availableAgents.length > 0) {
				if (!callingAgent.availableAgents.includes(assignedAgentId)) {
					throw new Error(`Access denied: You are not authorized to coordinate Agent "${assignedAgentId}".`);
				}
			}
		}

		// 2. 簡化實作：僅示範性質
		recorder.warn(`[TaskCreateTool] task_create is deprecated. Use task_dispatcher instead.`, { type: 'SYSTEM' });

		return {
			message: "Task manual creation is partially deprecated. Please use task_dispatcher.",
			goal
		};
	}
}
