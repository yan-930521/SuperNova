import { z } from 'zod';

import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseTool } from '../BaseTool';
import { AgentService } from '../../application/agent/AgentService';

/**
 * AgentRegisterTool (已廢棄，僅供過渡期參考)
 * 職責：負責動態註冊一個新的 Agent 實例或載入配置。
 */
export class AgentRegisterTool extends BaseTool {
  constructor() {
    super({
      name: 'agent_register',
      description: 'Register or load a new agent into the system.',
      category: 'core',
      safety_tier: 'TIER_2',
      required_capabilities: ['admin'],
      schema: z.object({
        agentId: z.string().describe('The ID of the agent to load.'),
        agentsDir: z.string().optional().describe('Optional custom directory to load from.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { agentId } = input;
    const runtime = GlobalRuntime.getInstance();
    
    const agentService = runtime.container.resolve<AgentService>('AgentService');
    const agent = await agentService.reloadAgent(agentId);
    
    return {
      message: `Agent ${agentId} registered successfully.`,
      id: agent.id,
      role: agent.role
    };
  }
}
