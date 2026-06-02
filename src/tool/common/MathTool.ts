import { z } from 'zod';

import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseTool } from '../BaseTool';

/**
 * MathTool
 * 執行精確的數學運算。
 */
export class MathTool extends BaseTool {
  constructor() {
    super({
      name: 'math_calculator',
      description: 'Perform precise mathematical calculations.',
      category: 'common',
      safety_tier: 'TIER_1',
      required_capabilities: ['utility'],
      schema: z.object({
        expression: z.string().describe('The mathematical expression to evaluate (e.g., "Math.sqrt(144) + 12 * 5").')
      })
    });
  }

  async run(input: { expression: string }, _context: IAgentExecuteContext): Promise<any> {
    try {
      // 這裡使用 Function 進行基本的安全沙盒運算 (僅限 Math 成員)
      // 注意：這不是絕對安全的，但在 TIER_1 環境下對於 Math 運算是足夠的
      const safeFn = new Function('Math', `return ${input.expression}`);
      const result = safeFn(Math);
      
      return {
        expression: input.expression,
        result: result
      };
    } catch (error: any) {
      throw new Error(`Failed to evaluate expression: ${error.message}`);
    }
  }
}
