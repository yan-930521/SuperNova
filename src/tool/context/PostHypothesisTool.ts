import { z } from 'zod';

import { OrchestratedContextService } from '../../../src_bk/OrchestratedContextService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

export class PostHypothesisTool extends BaseTool {
  constructor() {
    super({
      name: 'post_hypothesis',
      description: 'Record an unverified assumption or theory in the Orchestrated Context. Useful for noting down potential causes or ideas that need testing.',
      category: 'context',
      safety_tier: 'TIER_1',
      required_capabilities: ['reasoning'],
      schema: z.object({
        content: z.string().describe('The unverified hypothesis or assumption.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { chainId } = context;
    if (!chainId) return { status: 'error', message: 'No chainId available.' };

    const runtime = GlobalRuntime.getInstance();
    const contextService = runtime.container.resolve<OrchestratedContextService>('OrchestratedContextService');
    
    await contextService.addHypothesis(chainId, input.content);
    return { status: 'success', message: 'Hypothesis added to context.' };
  }
}
