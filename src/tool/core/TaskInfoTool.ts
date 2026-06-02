import { z } from 'zod';

import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';
import { TaskService } from '../../application/task/TaskService';

/**
 * TaskInfoTool
 * 職責：獲取特定任務節點的詳細執行資訊與結果。
 */
export class TaskInfoTool extends BaseTool {
	constructor() {
		super({
			name: 'task_info',
			description: 'Get detailed information about a specific task node; you MUST call `task_list` first to verify the target task exists before requesting details.',
			category: 'core',
			safety_tier: 'TIER_1',
			required_capabilities: ['orchestration'],
			schema: z.object({
				taskId: z.string().describe('The ID of the specific task node.')
			})
		});
	}

	async run(input: any, context: IAgentExecuteContext): Promise<any> {
		const { taskId } = input;
		const runtime = GlobalRuntime.getInstance();

    const taskService = runtime.container.resolve<TaskService>('TaskService');
		const task = await taskService.getTaskInfo(taskId);

		if (!task) {
			return `Task ${taskId} not found.`
		}

		return {
			id: task.id,
			goal: task.goal,
			status: task.status,
			assignedAgentId: task.assignedAgentId,
			dependencies: task.dependencies
		};
	}
}
