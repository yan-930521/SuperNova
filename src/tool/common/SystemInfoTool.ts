import * as os from 'os';
import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseTool } from '../BaseTool';

/**
 * SystemInfoTool
 * 獲取運行時的系統與硬體資訊。
 */
export class SystemInfoTool extends BaseTool {
  constructor() {
    super({
      name: 'system_info',
      description: 'Get information about the operating system and hardware.',
      category: 'common',
      safety_tier: 'TIER_1',
      required_capabilities: ['utility'],
      schema: z.object({})
    });
  }

  async run(_input: any, _context: IAgentExecuteContext): Promise<any> {
    return {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
      freeMemory: `${Math.round(os.freemem() / 1024 / 1024 / 1024)} GB`,
      uptime: `${Math.round(os.uptime() / 3600)} hours`,
      nodeVersion: process.version
    };
  }
}
