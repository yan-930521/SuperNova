import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseFileTool } from './BaseFileTool';

/**
 * WriteFileTool
 * 寫入內容至檔案。受限於 ./workspace 目錄。
 */
export class WriteFileTool extends BaseFileTool<{ path: string, content: string }, string> {
  constructor() {
    super({
      name: 'write_file',
      description: 'Write or overwrite content to a file. The path is relative to the workspace root.',
      category: 'file',
      safety_tier: 'TIER_2',
      required_capabilities: ['file_write'],
      schema: z.object({
        path: z.string().describe("Target file path to write (e.g., 'report.md')."),
        content: z.string().describe("Text content to write to the file.")
      })
    });
  }

  async run(input: { path: string, content: string }, context: IAgentExecuteContext): Promise<string> {
    try {
      const fullPath = this.validatePath(input.path, 'write');

      // 自動建立不存在的目錄
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullPath, input.content, 'utf-8');
      return `SUCCESS: File written to ${input.path}`;
    } catch (err: any) {
      return `ERROR: Failed to write to file "${input.path}": ${err.message}`;
    }
  }
}
