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
		const { sessionId } = context;
		const runtime = GlobalRuntime.getInstance();

		if (chainId) {
			const chain = runtime.taskManager.getChainStatus(chainId);
			const tasks = runtime.taskManager.getChainTasks(chainId);

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
			const allChains = runtime.taskManager.listChains();
			// 優先過濾當前 Session 的任務鏈，避免看到無關資訊
			const sessionChains = allChains.filter(c => c.sessionId === sessionId);

			return {
				totalChainsInSession: sessionChains.length,
				sessionChains: sessionChains.map(c => ({
					chainId: c.chainId,
					status: c.status,
					goal: c.goal,
					taskCount: c.nodes.length,
					completedCount: c.nodes.filter((n: any) => n.status === 'completed').length
				}))
			};
		}
	}
}
