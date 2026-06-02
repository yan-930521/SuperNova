import { z } from 'zod';

import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseTool } from '../BaseTool';

/**
 * TimeTool
 * 獲取系統當前時間與日期。
 */
export class TimeTool extends BaseTool {
  constructor() {
    super({
      name: 'get_now',
      description: 'Get the current system time and date.',
      category: 'common',
      safety_tier: 'TIER_1',
      required_capabilities: ['utility'],
      schema: z.object({
        timezone: z.string().optional().describe('Optional timezone (e.g., "Asia/Taipei"). Defaults to system timezone.')
      })
    });
  }

  async run(input: { timezone?: string }, _context: IAgentExecuteContext): Promise<any> {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long',
      timeZoneName: 'short',
      timeZone: input.timezone
    };

    return {
      iso: now.toISOString(),
      local: now.toLocaleString('zh-TW', options),
      timestamp: now.getTime()
    };
  }
}
