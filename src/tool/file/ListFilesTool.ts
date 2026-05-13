import { BaseFileTool } from './BaseFileTool';
import { IToolContext } from '../../../interfaces/tool/IToolContext';
import { z } from 'zod';
import * as fs from 'fs/promises';

/**
 * ListFilesTool 目錄列表工具
 * 繼承自 BaseFileTool，提供安全的目錄列表功能。
 */
export class ListFilesTool extends BaseFileTool<{ path?: string }, string[]> {
  constructor() {
    super(
      'list_files',
      '列出目錄中的檔案與子目錄名。',
      'TIER_1',
      ['file_read'],
      z.object({
        path: z.string().optional().describe('目標目錄路徑 (預設為 workspace)')
      })
    );
  }

  /**
   * 執行列表邏輯
   * @param input 包含路徑的輸入
   * @param context 工具執行上下文
   */
  async run(input: { path?: string }, context: IToolContext): Promise<string[]> {
    const targetPath = input.path || 'workspace';
    const absolutePath = this.validatePath(targetPath, 'read');
    return await fs.readdir(absolutePath);
  }
}
