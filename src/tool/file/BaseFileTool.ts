import { BaseTool } from '../BaseTool';
import { IToolContext } from '../../../interfaces/tool/IToolContext';
import { z } from 'zod';
import * as path from 'path';

/**
 * BaseFileTool 檔案工具基底類別
 * 負責所有檔案工具的路徑驗證（Sandbox 邏輯）。
 */
export abstract class BaseFileTool<TIn = any, TOut = any> extends BaseTool<TIn, TOut> {
  protected readonly WORKSPACE_DIR: string;
  protected readonly PROJECT_ROOT: string;
  protected readonly BLACKLIST: string[] = [
    '.env',
    '.git',
    'node_modules',
    'dist',
    'package-lock.json'
  ];

  constructor(
    name: string,
    description: string,
    safety_tier: any,
    required_capabilities: string[] = [],
    schema: z.ZodType<TIn> = z.any() as any
  ) {
    super(name, description, safety_tier, required_capabilities, schema);
    this.PROJECT_ROOT = path.resolve(process.cwd());
    this.WORKSPACE_DIR = path.resolve(this.PROJECT_ROOT, 'workspace');
  }

  /**
   * 驗證檔案路徑是否符合 Sandbox 安全規則
   * @param filePath 目標檔案路徑
   * @param operation 操作類型 ('read' | 'write' | 'delete')
   * @returns 絕對路徑
   * @throws Error 如果路徑不符合安全規則
   */
  protected validatePath(filePath: string, operation: 'read' | 'write' | 'delete'): string {
    const absolutePath = path.resolve(filePath);
    
    // 1. 檢查是否在黑名單中
    const relativeToRoot = path.relative(this.PROJECT_ROOT, absolutePath);
    if (this.isBlacklisted(relativeToRoot)) {
      throw new Error(`Access denied: Path is blacklisted: ${filePath}`);
    }

    // 2. 根據操作類型檢查權限範圍
    if (operation === 'write' || operation === 'delete') {
      // 寫入/刪除：路徑必須位於 WORKSPACE_DIR 內
      const relativeToWorkspace = path.relative(this.WORKSPACE_DIR, absolutePath);
      const isInsideWorkspace = !relativeToWorkspace.startsWith('..') && !path.isAbsolute(relativeToWorkspace);
      if (!isInsideWorkspace) {
        throw new Error(`Access denied: Write/Delete operation restricted to workspace: ${filePath}`);
      }
    } else if (operation === 'read') {
      // 讀取：必須位於 WORKSPACE_DIR 或 PROJECT_ROOT 內
      const relativeToRoot = path.relative(this.PROJECT_ROOT, absolutePath);
      const isInsideRoot = !relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot);
      
      if (!isInsideRoot) {
        throw new Error(`Access denied: Read operation restricted to project root: ${filePath}`);
      }
    }

    return absolutePath;
  }

  /**
   * 檢查路徑是否命中黑名單
   */
  private isBlacklisted(relativePath: string): boolean {
    const parts = relativePath.split(path.sep);
    return parts.some(part => this.BLACKLIST.includes(part));
  }

  /**
   * 執行工具的核心邏輯 (由子類實作)
   */
  abstract run(input: TIn, context: IToolContext): Promise<TOut>;
}
