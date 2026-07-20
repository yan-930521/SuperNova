import { z } from 'zod';

import { IWorkspaceManager } from '../../infra/persistence/IWorkspaceManager';
import { BaseTool, ToolContext } from './BaseTool';

export class ReadFileTool extends BaseTool {
  public readonly name = 'read_file';
  public readonly description = 'Read the contents of a file within the workspace. Provide the relative path to the file.';
  public readonly schema = z.object({
    relativePath: z.string().describe('The relative path of the file to read, e.g., src/main.ts'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager,
    private readonly sessionId: string,
    private readonly agentId: string
  ) {
    super();
  }

  public async execute(args: { relativePath: string }, context: ToolContext): Promise<string> {
    try {
      const content = await this.workspaceManager.readFile(this.sessionId, this.agentId, args.relativePath);
      return content;
    } catch (error: any) {
      return `Failed to read file: ${error.message}`;
    }
  }
}

export class WriteFileTool extends BaseTool {
  public readonly name = 'write_file';
  public readonly description = 'Write content to a file within the workspace. Provide the relative path and the content to write.';
  public readonly schema = z.object({
    relativePath: z.string().describe('The relative path of the file to write, e.g., src/main.ts'),
    content: z.string().describe('The content to write to the file'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager,
    private readonly sessionId: string,
    private readonly agentId: string
  ) {
    super();
  }

  public async execute(args: { relativePath: string; content: string }, context: ToolContext): Promise<string> {
    try {
      await this.workspaceManager.writeFile(this.sessionId, this.agentId, args.relativePath, args.content);
      return `Successfully wrote to ${args.relativePath}`;
    } catch (error: any) {
      return `Failed to write file: ${error.message}`;
    }
  }
}

export class ListFilesTool extends BaseTool {
  public readonly name = 'list_files';
  public readonly description = 'List files in a directory within the workspace. Provide the relative path, or leave empty for root.';
  public readonly schema = z.object({
    relativePath: z.string().optional().describe('The relative path of the directory to list. Leave empty for root directory.'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager,
    private readonly sessionId: string,
    private readonly agentId: string
  ) {
    super();
  }

  public async execute(args: { relativePath?: string }, context: ToolContext): Promise<string> {
    try {
      const files = await this.workspaceManager.listFiles(this.sessionId, this.agentId, args.relativePath);
      return files.join('\n');
    } catch (error: any) {
      return `Failed to list files: ${error.message}`;
    }
  }
}

export class RunBashTool extends BaseTool {
  public readonly name = 'run_bash';
  public readonly description = 'Run a bash command within the workspace sandbox.';
  public readonly schema = z.object({
    command: z.string().describe('The bash command to execute'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager,
    private readonly sessionId: string,
    private readonly agentId: string
  ) {
    super();
  }

  public async execute(args: { command: string }, context: ToolContext): Promise<string> {
    try {
      const result = await this.workspaceManager.runBash(this.sessionId, this.agentId, args.command);
      return `ExitCode: ${result.exitCode}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`;
    } catch (error: any) {
      return `Failed to run bash command: ${error.message}`;
    }
  }
}
