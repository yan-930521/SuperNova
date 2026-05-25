import * as vm from 'vm';
import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseTool } from '../BaseTool';

/**
 * CodeExecutorTool
 * 在安全沙盒中執行 JavaScript 代碼。
 */
export class CodeExecutorTool extends BaseTool {
  constructor() {
    super(
      'code_executor',
      'Execute JavaScript code in a sandboxed environment for data analysis or logic computation.',
      'TIER_2',
      ['coding'],
      z.object({
        code: z.string().describe('The JavaScript code to execute.'),
        timeout: z.number().optional().default(5000).describe('Execution timeout in milliseconds.')
      })
    );
  }

  async run(input: { code: string; timeout: number }, _context: IAgentExecuteContext): Promise<any> {
    const sandbox = {
      console: {
        log: (...args: any[]) => outputs.push(args.join(' ')),
        error: (...args: any[]) => outputs.push(`ERROR: ${args.join(' ')}`)
      },
      result: undefined
    };

    const outputs: string[] = [];
    const context = vm.createContext(sandbox);

    try {
      const script = new vm.Script(input.code);
      script.runInContext(context, { timeout: input.timeout });
      
      return {
        logs: outputs,
        returnValue: sandbox.result
      };
    } catch (error: any) {
      return {
        logs: outputs,
        error: error.message,
        status: 'failed'
      };
    }
  }
}
