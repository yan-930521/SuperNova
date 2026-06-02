import { z } from 'zod';

import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';
import { TaskService } from '../../application/task/TaskService';

/**
 * TaskListTool (已廢棄，僅供過渡期參考)
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
		const { sessionId } = context;
		const runtime = GlobalRuntime.getInstance();
    const taskService = runtime.container.resolve<TaskService>('TaskService');

		if (chainId) {
			const chain = taskService.getChainStatus(chainId);
			const tasks = await taskService.getChainTasks(chainId);

			return {
				chainId,
				status: chain?.status || 'unknown',
				totalTasks: tasks.length,
				message: (tasks.length === 0 && chain?.status === 'planning')
					? "System is currently planning the task graph. Please check back in a moment."
					: undefined,
				tasks: tasks.map(t => ({
					id: t.id,
					goal: t.goal,
					status: t.status,
					assignedAgentId: t.assignedAgentId
				}))
			};
		} else {
			const allChains = taskService.listChains();
			const sessionChains = allChains.filter(c => c.sessionId === sessionId);

			return {
				totalChainsInSession: sessionChains.length,
				sessionChains: sessionChains.map(c => ({
					chainId: c.chainId,
					status: c.status,
					goal: c.goal
				}))
			};
		}
	}
}
