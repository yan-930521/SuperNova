import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

import { recorder } from '../../infra/LogManager';
import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseFileTool } from './BaseFileTool';

/**
 * WriteFileTool
 * Writes content to a file. Restricted to the ./workspace directory.
 */
export class WriteFileTool extends BaseFileTool<{ path: string, content: string }, string> {
  constructor() {
    super({
      name: 'write_file',
      description: 'Write content to a file. The path is relative to your current sandbox root.',
      category: 'file',
      safety_tier: 'TIER_2',
      required_capabilities: ['file_write'],
      schema: z.object({
        path: z.string().describe("Target file path (e.g., 'report.md' or 'logs/info.txt'). Do NOT include 'workspace/' prefix."),
        content: z.string().describe("Text content to write")
      })
    });
  }

  async run(input: { path: string, content: string }, context: IAgentExecuteContext): Promise<string> {
    try {
      const fullPath = this.validatePath(input.path, 'write');

      // Create directories if missing
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullPath, input.content, 'utf-8');

      recorder.info(`[WriteFileTool] Successfully wrote to ${input.path}`, { type: 'TOOL', session_id: context.sessionId });
      return `SUCCESS: File written to ${input.path}`;
    } catch (err: any) {
      return `ERROR: Failed to write to file "${input.path}": ${err.message}`;
    }
  }
}
