import * as fs from 'fs/promises';
import { z } from 'zod';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseFileTool } from './BaseFileTool';

/**
 * ReadFileTool
 * 讀取檔案內容。受限於 ./workspace 目錄。
 */
export class ReadFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super({
      name: 'read_file',
      description: 'Read the content of a file. The path is relative to the workspace root.',
      category: 'file',
      safety_tier: 'TIER_1',
      required_capabilities: ['file_read'],
      schema: z.object({
        path: z.string().describe("Target file path to read (e.g., 'data.json' or 'docs/README.md').")
      })
    });
  }

  async run(input: { path: string }, context: IAgentExecuteContext): Promise<string> {
    try {
      const fullPath = this.validatePath(input.path, 'read');
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (err: any) {
      return `ERROR: Failed to read file "${input.path}": ${err.message}`;
    }
  }
}
