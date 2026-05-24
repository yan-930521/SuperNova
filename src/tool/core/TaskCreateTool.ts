import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { recorder } from '../../infra/LogManager';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { IAgentExecuteContext } from '../../task/types';
import { BaseTool } from '../BaseTool';

/**
 * TaskCreateTool
 * 職責：負責在系統中真正創建任務節點，並可選擇性地開啟新任務鏈。
 * 2.0 增強：驗證 assignedAgentId 是否在呼叫者的白名單中。
 */
export class TaskCreateTool extends BaseTool {
  constructor() {
    super(
      'task_create',
      'Create a new task node in the system. Can start a new chain or add to an existing one.',
      'TIER_2',
      ['orchestration'],
      z.object({
        goal: z.string().describe('The specific goal of the task.'),
        assignedAgentId: z.string().describe('ID of the agent to assign this task to.'),
        chainId: z.string().optional().describe('Existing chain ID. MANDATORY: Leave empty if starting a new goal. ONLY use IDs returned by previous tool calls.'),
        dependencies: z.array(z.string()).optional().describe('IDs of tasks this new task depends on.')
      })
    );
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { goal, chainId: targetChainId, dependencies, assignedAgentId } = input;
    const runtime = GlobalRuntime.getInstance();
    
    // 1. 權限驗證：檢查指派的 Agent 是否在呼叫者的可用名單內
    if (assignedAgentId) {
      const callingAgent = runtime.agentRegistry.getAgent(context.agentId);
      if (callingAgent && callingAgent.availableAgents && callingAgent.availableAgents.length > 0) {
        if (!callingAgent.availableAgents.includes(assignedAgentId)) {
          throw new Error(`Access denied: You are not authorized to coordinate Agent "${assignedAgentId}". Available agents: ${callingAgent.availableAgents.join(', ')}`);
        }
      }
    }

    let chainId = targetChainId;

    // 2. 安全檢查：如果提供了 chainId 但系統中不存在，視為幻覺並重置
    if (chainId) {
      const exists = runtime.taskManager.getChainStatus(chainId);
      if (!exists) {
        recorder.warn(`[TaskCreateTool] Hallucinated chainId detected: ${chainId}. Falling back to new chain.`, { session_id: context.sessionId });
        chainId = undefined;
      }
    }

    // 3. 如果沒有指定 chainId (或之前的無效)，先建立一個新任務鏈
    if (!chainId) {
      chainId = await runtime.taskManager.createChain(goal, context.sessionId, context.agentId);
    }

    // 4. 建立任務節點
    const taskId = `task-manual-${uuidv4().substring(0, 8)}`;
    const taskNode = {
      id: taskId,
      goal,
      dependencies: dependencies || [],
      status: 'pending' as any,
      assignedAgentId: assignedAgentId
    };

    // 5. 將任務加入鏈中
    await runtime.taskManager.addTaskToChain(chainId, taskNode as any);

    return {
      message: "Task created and persisted successfully.",
      chainId,
      taskId,
      goal
    };
  }
}
