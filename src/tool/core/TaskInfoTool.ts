import { z } from 'zod';

import { TaskService } from '../../application/task/TaskService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

/**
 * TaskInfoTool
 * 職責：獲取特定任務節點的詳細執行資訊與結果。
 * 對接到 0.4.0 的 TaskService。
 */
export class TaskInfoTool extends BaseTool {
  constructor() {
    super({
      name: 'task_info',
      description: 'Get detailed information about a specific task node. Useful for checking results of previous steps.',
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
    const task = await taskService.getTask(taskId);

    if (!task) {
      return {
        status: "error",
        message: `Task ${taskId} not found.`
      };
    }

    return {
      id: task.id,
      goal: task.goal,
      description: task.description,
      status: task.status,
      phase: task.flow.currentPhase,
      template: task.flow.templateType,
      traceId: task.traceId,
      sessionId: task.sessionId,
      metadata: task.metadata,
      dependencies: task.dependencies,
      subGraph: task.subGraph ? {
        nodeCount: task.subGraph.getAllTasks().length,
        phases: task.subGraph.phases
      } : null
    };
  }
}
