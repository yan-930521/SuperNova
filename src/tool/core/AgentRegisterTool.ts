import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { BaseTool } from '../BaseTool';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';

/**
 * AgentRegisterTool
 * 職責：負責動態註冊一個新的 Agent 實例或載入配置。
 */
export class AgentRegisterTool extends BaseTool {
  constructor() {
    super(
      'agent_register',
      'Register or load a new agent into the system.',
      'TIER_2',
      ['admin'],
      z.object({
        agentId: z.string().describe('The ID of the agent to load.'),
        agentsDir: z.string().optional().describe('Optional custom directory to load from.')
      })
    );
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { agentId, agentsDir } = input;
    const runtime = GlobalRuntime.getInstance();
    
    const agent = await runtime.agentRegistry.loadAgentById(agentId, agentsDir);
    
    return {
      message: `Agent ${agentId} registered successfully.`,
      id: agent.id,
      role: agent.role
    };
  }
}
