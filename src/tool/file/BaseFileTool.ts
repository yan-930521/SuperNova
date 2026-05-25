import * as path from 'path';
import { z } from 'zod';

import { IAgentExecuteContext } from '../../infra/types/agent';
import { BaseTool, ToolSafetyTier } from '../BaseTool';

/**
 * BaseFileTool
 * Base class for all file-related tools with sandbox protection.
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
    safety_tier: ToolSafetyTier,
    required_capabilities: string[] = [],
    schema: z.ZodType<TIn> = z.any() as any
  ) {
    super(name, description, safety_tier, required_capabilities, schema);
    this.PROJECT_ROOT = path.resolve(process.cwd());
    this.WORKSPACE_DIR = path.resolve(this.PROJECT_ROOT, 'workspace');
  }

  /**
   * Validate if the path is within the sandbox.
   * 自動處理路徑前綴：確保所有操作都在 workspace/ 內，且不會重複添加前綴。
   */
  protected validatePath(filePath: string, operation: 'read' | 'write' | 'delete'): string {
    // 1. 嘗試先從專案根目錄解析，看是否已經在 workspace 內
    const absoluteFromRoot = path.resolve(this.PROJECT_ROOT, filePath);
    const relativeToWorkspaceFromRoot = path.relative(this.WORKSPACE_DIR, absoluteFromRoot);
    
    let absolutePath: string;

    // 檢查是否已經在 workspace 內 (沒有向上跳轉且不是絕對路徑)
    const alreadyInWorkspace = !relativeToWorkspaceFromRoot.startsWith('..') && !path.isAbsolute(relativeToWorkspaceFromRoot);

    if (alreadyInWorkspace) {
        // 如果已經在 workspace 內 (例如傳入 "workspace/test.txt")，直接使用
        absolutePath = absoluteFromRoot;
    } else {
        // 如果不在 workspace 內 (例如傳入 "test.txt")，則將其映射至 workspace 內
        // 同時處理掉絕對路徑的情況，強制將其視為相對路徑
        const normalizedRelative = path.isAbsolute(filePath) 
            ? path.relative(this.PROJECT_ROOT, filePath) 
            : filePath;
        absolutePath = path.resolve(this.WORKSPACE_DIR, normalizedRelative);
    }

    // 2. 嚴格邊界檢查 (二次確認，防止 ../../ 逃逸)
    const finalRelative = path.relative(this.WORKSPACE_DIR, absolutePath);
    const isEscaping = finalRelative.startsWith('..') || path.isAbsolute(finalRelative);

    if (isEscaping) {
      throw new Error(`Access denied: Operation escaped sandbox boundary. Attempted: ${filePath}`);
    }

    // 3. 黑名單檢查
    const blacklistedPart = this.getBlacklistedPart(finalRelative);
    if (blacklistedPart) {
      throw new Error(`Access denied: Path contains blacklisted segment "${blacklistedPart}".`);
    }

    return absolutePath;
  }

  private getBlacklistedPart(relativePath: string): string | null {
    const parts = relativePath.split(path.sep);
    return parts.find(part => this.BLACKLIST.includes(part)) || null;
  }

  private isBlacklisted(relativePath: string): boolean {
    return this.getBlacklistedPart(relativePath) !== null;
  }

  abstract run(input: TIn, context: IAgentExecuteContext): Promise<TOut>;
}
