import { BaseFileTool } from './BaseFileTool';
import { IToolContext } from '../../../interfaces/tool/IToolContext';
import { z } from 'zod';
import * as fs from 'fs/promises';

/**
 * DeleteFileTool 檔案刪除工具
 * 繼承自 BaseFileTool，提供安全的檔案刪除功能。
 */
export class DeleteFileTool extends BaseFileTool<{ path: string }, string> {
  constructor() {
    super(
      'delete_file',
      '刪除指定的檔案。限制在 ./workspace 目錄內。',
      'TIER_2',
      ['file_delete'],
      z.object({
        path: z.string().describe('目標檔案路徑')
      })
    );
  }

  /**
   * 執行刪除邏輯
   * @param input 包含路徑的輸入
   * @param context 工具執行上下文
   */
  async run(input: { path: string }, context: IToolContext): Promise<string> {
    const absolutePath = this.validatePath(input.path, 'delete');
    await fs.unlink(absolutePath);
    return `SUCCESS: File ${input.path} deleted.`;
  }
}
