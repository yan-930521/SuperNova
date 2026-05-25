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
    super(
      'system_info',
      'Get information about the operating system and hardware.',
      'TIER_1',
      ['utility'],
      z.object({})
    );
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
