import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { BaseTool } from '../BaseTool';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';

/**
 * AgentListTool
 * 職責：獲取當前系統中可用的代理概況。
 * 2.0 增強：根據呼叫 Agent 的 availableAgents 白名單進行過濾。
 */
export class AgentListTool extends BaseTool {
  constructor() {
    super(
      'agent_list',
      'List all active agents that you are authorized to coordinate.',
      'TIER_1',
      ['admin'],
      z.object({})
    );
  }

  async run(_input: any, context: IAgentExecuteContext): Promise<any> {
    const runtime = GlobalRuntime.getInstance();
    
    // 1. 獲取發起調用的 Agent 實例
    const callingAgent = runtime.agentRegistry.getAgent(context.agentId);
    
    // 2. 獲取所有 Agent
    let agents = runtime.agentRegistry.getAllAgents();

    // 3. 根據白名單過濾 (如果調用者定義了 availableAgents)
    if (callingAgent && callingAgent.availableAgents && callingAgent.availableAgents.length > 0) {
      agents = agents.filter(a => callingAgent.availableAgents.includes(a.id));
    }

    const result = agents.map(a => ({
      id: a.id,
      role: a.role,
      capabilities: a.capabilities
    }));

    return {
      total: result.length,
      agents: result
    };
  }
}
