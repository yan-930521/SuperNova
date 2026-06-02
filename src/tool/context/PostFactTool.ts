import { z } from 'zod';

import { OrchestratedContextService } from '../../application/memory/OrchestratedContextService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

export class PostFactTool extends BaseTool {
  constructor() {
    super({
      name: 'post_fact',
      description: 'Add a verified fact to the Orchestrated Context (Blackboard) for the current task chain. Use this to record important findings that other agents should know.',
      category: 'context',
      safety_tier: 'TIER_1',
      required_capabilities: ['reasoning'],
      schema: z.object({
        content: z.string().describe('The verified fact to record.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { chainId } = context;
    if (!chainId) return { status: 'error', message: 'No chainId available.' };

    const runtime = GlobalRuntime.getInstance();
    const contextService = runtime.container.resolve<OrchestratedContextService>('OrchestratedContextService');
    
    await contextService.addFact(chainId, input.content);
    return { status: 'success', message: 'Fact added to context.' };
  }
}
