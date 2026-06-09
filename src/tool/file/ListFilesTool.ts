import * as fs from 'fs/promises';
import { z } from 'zod';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseFileTool } from './BaseFileTool';

/**
 * ListFilesTool
 * 列出目錄內容。受限於 ./workspace 目錄。
 */
export class ListFilesTool extends BaseFileTool<{ path: string }, string[]> {
  constructor() {
    super({
      name: 'list_files',
      description: 'List the files and directories in a given path. The path is relative to the workspace root.',
      category: 'file',
      safety_tier: 'TIER_1',
      required_capabilities: ['file_read'],
      schema: z.object({
        path: z.string().describe("Directory path to list (e.g., '.' or 'logs'). Use '.' for workspace root.")
      })
    });
  }

  async run(input: { path: string }, context: IAgentExecuteContext): Promise<string[]> {
    try {
      const fullPath = this.validatePath(input.path, 'read');
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      return entries.map(entry => {
        const type = entry.isDirectory() ? '[DIR]' : '[FILE]';
        return `${type} ${entry.name}`;
      });
    } catch (err: any) {
      throw new Error(`Failed to list directory "${input.path}": ${err.message}`);
    }
  }
}
