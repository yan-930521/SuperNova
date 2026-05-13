import { BaseFileTool } from './BaseFileTool';
import { IToolContext } from '../../../interfaces/tool/IToolContext';
import { z } from 'zod';
import * as fs from 'fs/promises';

/**
 * ReadFileTool 檔案讀取工具
 * 繼承自 BaseFileTool，提供安全的檔案讀取功能。
 */
export class ReadFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super(
      'read_file',
      '讀取檔案內容',
      'TIER_1',
      ['file_read'],
      z.object({
        path: z.string().describe('目標檔案路徑')
      })
    );
  }

  /**
   * 執行讀取邏輯
   * @param input 包含路徑的輸入
   * @param context 工具執行上下文
   */
  async run(input: { path: string }, context: IToolContext): Promise<string> {
    const absolutePath = this.validatePath(input.path, 'read');
    return await fs.readFile(absolutePath, 'utf-8');
  }
}
