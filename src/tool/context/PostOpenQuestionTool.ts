import { z } from 'zod';

import { OrchestratedContextService } from '../../application/memory/OrchestratedContextService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

export class PostOpenQuestionTool extends BaseTool {
  constructor() {
    super({
      name: 'open_question',
      description: 'Record an unresolved uncertainty or question that blocks progress. This drives further reasoning or tool use by other agents.',
      category: 'context',
      safety_tier: 'TIER_1',
      required_capabilities: ['reasoning'],
      schema: z.object({
        content: z.string().describe('The open question or uncertainty.')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { chainId } = context;
    if (!chainId) return { status: 'error', message: 'No chainId available.' };

    const runtime = GlobalRuntime.getInstance();
    const contextService = runtime.container.resolve<OrchestratedContextService>('OrchestratedContextService');
    
    // 呼叫 Service 的方法 (如果 Service 尚未實作此方法，需要先加上)
    if (typeof (contextService as any).addOpenQuestion === 'function') {
      await (contextService as any).addOpenQuestion(chainId, input.content);
      return { status: 'success', message: 'Open question added to context.' };
    } else {
      return { status: 'error', message: 'addOpenQuestion method not implemented in OrchestratedContextService.' };
    }
  }
}
