import * as fs from 'fs/promises';
import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseFileTool } from './BaseFileTool';

/**
 * DeleteFileTool
 * Deletes a file. Restricted to the workspace directory.
 */
export class DeleteFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super({
      name: 'delete_file',
      description: 'Delete a specific file. The path is relative to your current sandbox root.',
      category: 'file',
      safety_tier: 'TIER_2',
      required_capabilities: ['file_delete'],
      schema: z.object({
        path: z.string().describe("Path to the file to delete (e.g., 'old_data.tmp'). Do NOT include 'workspace/' prefix.")
      })
    });
  }

  async run(input: { path: string }, context: IAgentExecuteContext): Promise<string> {
    const absolutePath = this.validatePath(input.path, 'delete');
    await fs.unlink(absolutePath);
    return `SUCCESS: File ${input.path} deleted.`;
  }
}
