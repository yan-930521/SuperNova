import * as fs from 'fs/promises';
import { z } from 'zod';

import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseFileTool } from './BaseFileTool';

/**
 * ReadFileTool
 * Reads file content. Restricted to project root.
 */
export class ReadFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super({
      name: 'read_file',
      description: 'Read the content of a file. The path is relative to your current sandbox root.',
      category: 'file',
      safety_tier: 'TIER_1',
      required_capabilities: ['file_read'],
      schema: z.object({
        path: z.string().describe("Path to the file to read (e.g., 'config.json'). Do NOT include 'workspace/' prefix.")
      })
    });
  }

  async run(input: { path: string }, context: IAgentExecuteContext): Promise<string> {
    try {
      const absolutePath = this.validatePath(input.path, 'read');
      return await fs.readFile(absolutePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return `ERROR: File not found at path "${input.path}". Please verify the file exists using 'list_files'.`;
      }
      return `ERROR: Failed to read file "${input.path}": ${err.message}`;
    }
  }
}
