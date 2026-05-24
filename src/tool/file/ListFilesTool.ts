import * as fs from 'fs/promises';
import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { BaseFileTool } from './BaseFileTool';

/**
 * ListFilesTool
 * Lists files in a directory. Restricted to project root.
 */
export class ListFilesTool extends BaseFileTool<{ path?: string }, string[]> {
  constructor() {
    super(
      'list_files',
      'List files and directories. The path is relative to your current sandbox root.',
      'TIER_1',
      ['file_read'],
      z.object({
        path: z.string().optional().describe("Target directory path. Defaults to '.' (sandbox root). Do NOT include 'workspace/' prefix.")
      })
    );
  }

  async run(input: { path?: string }, context: IAgentExecuteContext): Promise<string[]> {
    const targetPath = input.path || 'workspace';
    const absolutePath = this.validatePath(targetPath, 'read');
    return await fs.readdir(absolutePath);
  }
}
