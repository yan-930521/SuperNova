import { z } from 'zod';

import { OrchestratedContextService } from '../../application/memory/OrchestratedContextService';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { GlobalRuntime } from '../../runtime/GlobalRuntime';
import { BaseTool } from '../BaseTool';

export class ContextVariableTool extends BaseTool {
  constructor() {
    super({
      name: 'variable_access',
      description: 'Read or write large data variables in the Orchestrated Context. Uses progressive disclosure: keys are listed in the briefing, but values must be read via this tool.',
      category: 'context',
      safety_tier: 'TIER_1',
      required_capabilities: ['reasoning'],
      schema: z.object({
        action: z.enum(['read', 'write']).describe('Whether to read or write a variable.'),
        key: z.string().describe('The key/name of the variable.'),
        value: z.any().optional().describe('The value to store. Required if action is "write".')
      })
    });
  }

  async run(input: any, context: IAgentExecuteContext): Promise<any> {
    const { action, key, value } = input;
    const { chainId } = context;

    if (!chainId) return { status: 'error', message: 'No chainId available.' };

    const runtime = GlobalRuntime.getInstance();
    const contextService = runtime.container.resolve<OrchestratedContextService>('OrchestratedContextService');

    try {
      if (action === 'write') {
        if (value === undefined) return { status: 'error', message: 'Value is required for write action.' };
        await contextService.setVariable(chainId, key, value);
        return { status: 'success', message: `Variable '${key}' stored in context.` };
      } else if (action === 'read') {
        const state = await contextService.getBlackboard(chainId);
        const val = state.variables[key];
        if (val === undefined) return { status: 'error', message: `Variable '${key}' not found.` };
        return { status: 'success', value: val };
      }
    } catch (error: any) {
      return { status: 'error', message: `Variable operation failed: ${error.message}` };
    }
  }
}
