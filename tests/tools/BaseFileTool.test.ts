import { BaseFileTool } from '../../src/tool/file/BaseFileTool';
import { IToolContext } from '../../interfaces/tool/IToolContext';
import { z } from 'zod';
import * as path from 'path';

class TestFileTool extends BaseFileTool {
  constructor() {
    super('test-file-tool', 'A tool for testing path validation', 'TIER_1', [], z.any());
  }
  async run(input: any, context: IToolContext): Promise<any> {
    return input;
  }
  
  // 暴露受保護的方法以便測試
  public testValidatePath(filePath: string, operation: 'read' | 'write' | 'delete'): string {
    return (this as any).validatePath(filePath, operation);
  }
}

describe('BaseFileTool Path Validation', () => {
  let tool: TestFileTool;
  const projectRoot = path.resolve(process.cwd());
  const workspaceDir = path.resolve(projectRoot, 'workspace');

  beforeEach(() => {
    tool = new TestFileTool();
  });

  test('should allow reading from workspace', () => {
    const filePath = path.join(workspaceDir, 'test.txt');
    expect(() => tool.testValidatePath(filePath, 'read')).not.toThrow();
  });

  test('should allow reading from project root', () => {
    const filePath = path.join(projectRoot, 'README.md');
    expect(() => tool.testValidatePath(filePath, 'read')).not.toThrow();
  });

  test('should allow writing to workspace', () => {
    const filePath = path.join(workspaceDir, 'output.txt');
    expect(() => tool.testValidatePath(filePath, 'write')).not.toThrow();
  });

  test('should block writing to project root outside workspace', () => {
    const filePath = path.join(projectRoot, 'config.json');
    expect(() => tool.testValidatePath(filePath, 'write')).toThrow(/Access denied/);
  });

  test('should block access to blacklisted files in project root', () => {
    const filePath = path.join(projectRoot, '.env');
    expect(() => tool.testValidatePath(filePath, 'read')).toThrow(/Access denied/);
  });

  test('should block access to blacklisted directories', () => {
    const filePath = path.join(projectRoot, 'node_modules', 'some-pkg', 'index.js');
    expect(() => tool.testValidatePath(filePath, 'read')).toThrow(/Access denied/);
  });

  test('should prevent path traversal', () => {
    const filePath = path.resolve(workspaceDir, '../../etc/passwd');
    expect(() => tool.testValidatePath(filePath, 'read')).toThrow(/Access denied/);
  });
});
