import * as fs from 'fs/promises';
import { z } from 'zod';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseFileTool } from './BaseFileTool';

/**
 * DeleteFileTool
 * 刪除檔案或目錄。受限於 ./workspace 目錄。
 */
export class DeleteFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super({
      name: 'delete_file',
      description: 'Delete a file or directory permanently. Use with caution.',
      category: 'file',
      safety_tier: 'TIER_3',
      required_capabilities: ['file_delete'],
      schema: z.object({
        path: z.string().describe("Target path to delete.")
      })
    });
  }

  async run(input: { path: string }, context: IAgentExecuteContext): Promise<string> {
    try {
      const fullPath = this.validatePath(input.path, 'delete');
      
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
        return `SUCCESS: Directory ${input.path} and its contents deleted.`;
      } else {
        await fs.unlink(fullPath);
        return `SUCCESS: File ${input.path} deleted.`;
      }
    } catch (err: any) {
      return `ERROR: Failed to delete "${input.path}": ${err.message}`;
    }
  }
}
