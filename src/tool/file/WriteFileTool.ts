import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { logger } from '../../infra/LogManager';
import { BaseFileTool } from './BaseFileTool';

/**
 * WriteFileTool 類
 * 用於在受限的沙箱目錄 (./workspace) 中寫入檔案內容。
 */
export class WriteFileTool extends BaseFileTool<{ path: string, content: string }, string> {
  constructor() {
    super(
      'WriteFile',
      'Write content to a file. Strictly restricted to the ./workspace directory.',
      'TIER_2',
      ['FILE_WRITE'],
      z.object({
        path: z.string().describe("Target file path relative to project root"),
        content: z.string().describe("Text content to write")
      })
    );
  }

  /**
   * 執行寫入邏輯
   * @param input 路徑與內容
   */
  async run(input: { path: string, content: string }): Promise<string> {
    const fullPath = this.validatePath(input.path, 'write');
    
    // 確保父目錄存在
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, input.content, 'utf-8');
    
    logger.info(`[WriteFileTool] Successfully wrote to ${input.path}`, { type: 'TOOL' });
    return `SUCCESS: File written to ${input.path}`;
  }
}
