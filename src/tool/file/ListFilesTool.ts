import * as fs from 'fs/promises';
import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseFileTool } from './BaseFileTool';

/**
 * ListFilesTool
 * Lists files in a directory. Restricted to project root.
 */
export class ListFilesTool extends BaseFileTool<{ path?: string }, string[]> {
  constructor() {
    super({
      name: 'list_files',
      description: 'List files and directories. The path is relative to your current sandbox root.',
      category: 'file',
      safety_tier: 'TIER_1',
      required_capabilities: ['file_read'],
      schema: z.object({
        path: z.string().optional().describe("Target directory path. Defaults to '.' (sandbox root). Do NOT include 'workspace/' prefix.")
      })
    });
  }

  async run(input: { path?: string }, context: IAgentExecuteContext): Promise<string[]> {
    const targetPath = input.path || 'workspace';
    const absolutePath = this.validatePath(targetPath, 'read');
    return await fs.readdir(absolutePath);
  }
}
