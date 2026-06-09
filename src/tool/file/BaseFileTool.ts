import * as path from 'path';
import { IAgentExecuteContext } from '../../core/messaging/IBus';
import { BaseTool, ToolMetadata } from '../BaseTool';

/**
 * BaseFileTool
 * 檔案操作工具基類，提供沙箱保護與路徑驗證。
 */
export abstract class BaseFileTool<TIn = any, TOut = any> extends BaseTool<TIn, TOut> {
  protected readonly WORKSPACE_DIR: string;
  protected readonly PROJECT_ROOT: string;
  protected readonly BLACKLIST: string[] = [
    '.env',
    '.git',
    'node_modules',
    'dist',
    'package-lock.json',
    'bun.lockb',
    'supernova.json'
  ];

  constructor(metadata: ToolMetadata<TIn>) {
    super(metadata);
    this.PROJECT_ROOT = path.resolve(process.cwd());
    this.WORKSPACE_DIR = path.resolve(this.PROJECT_ROOT, 'workspace');
  }

  /**
   * 驗證路徑是否在沙箱內 (./workspace)
   * 自動處理路徑前綴，防止逃逸。
   */
  protected validatePath(filePath: string, operation: 'read' | 'write' | 'delete'): string {
    // 1. 統一解析為絕對路徑
    const absoluteFromRoot = path.resolve(this.PROJECT_ROOT, filePath);
    const relativeToWorkspaceFromRoot = path.relative(this.WORKSPACE_DIR, absoluteFromRoot);
    
    let absolutePath: string;

    // 檢查是否已經在 workspace 內
    const alreadyInWorkspace = !relativeToWorkspaceFromRoot.startsWith('..') && !path.isAbsolute(relativeToWorkspaceFromRoot);

    if (alreadyInWorkspace) {
        absolutePath = absoluteFromRoot;
    } else {
        // 強制將所有路徑視為相對路徑並映射至 workspace 內
        const normalizedRelative = path.isAbsolute(filePath) 
            ? path.relative(this.PROJECT_ROOT, filePath) 
            : filePath;
        absolutePath = path.resolve(this.WORKSPACE_DIR, normalizedRelative);
    }

    // 2. 嚴格邊界檢查 (防止 ../../ 逃逸)
    const finalRelative = path.relative(this.WORKSPACE_DIR, absolutePath);
    const isEscaping = finalRelative.startsWith('..') || path.isAbsolute(finalRelative);

    if (isEscaping) {
      throw new Error(`Access denied: Operation [${operation}] escaped sandbox boundary. Attempted: ${filePath}`);
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

  abstract run(input: TIn, context: IAgentExecuteContext): Promise<TOut>;
}
