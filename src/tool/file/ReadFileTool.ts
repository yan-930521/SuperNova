import * as fs from 'fs/promises';
import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseFileTool } from './BaseFileTool';

/**
 * ReadFileTool
 * Reads file content. Restricted to project root.
 */
export class ReadFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super(
      'read_file',
      'Read the content of a file. The path is relative to your current sandbox root.',
      'TIER_1',
      ['file_read'],
      z.object({
        path: z.string().describe("Path to the file to read (e.g., 'config.json'). Do NOT include 'workspace/' prefix.")
      })
    );
  }

  async run(input: { path: string }, context: IAgentExecuteContext): Promise<string> {
    const absolutePath = this.validatePath(input.path, 'read');
    return await fs.readFile(absolutePath, 'utf-8');
  }
}
