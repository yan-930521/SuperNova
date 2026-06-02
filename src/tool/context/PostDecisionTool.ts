import { z } from 'zod';

import { OrchestratedContextService } from '../../application/memory/OrchestratedContextService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

export class PostDecisionTool extends BaseTool {
  constructor() {
    super({
      name: 'post_decision',
      description: 'Record a decision or strategy commitment in the Orchestrated Context. Must include the reasoning behind the decision.',
      category: 'context',
      safety_tier: 'TIER_1',
      required_capabilities: ['reasoning'],
      schema: z.object({
        content: z.string().describe('The decision that was made.'),
        reasoning: z.string().describe('The rationale or evidence supporting this decision.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { chainId } = context;
    if (!chainId) return { status: 'error', message: 'No chainId available.' };

    const runtime = GlobalRuntime.getInstance();
    const contextService = runtime.container.resolve<OrchestratedContextService>('OrchestratedContextService');
    
    await contextService.addDecision(chainId, input.content, input.reasoning);
    return { status: 'success', message: 'Decision added to context.' };
  }
}
